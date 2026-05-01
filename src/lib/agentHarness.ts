import prisma from './db';
import { formatCardKey } from './cardKeys';
import { pathForCardKey } from './appRoutes';
import { embedText, isEmbeddingEnabled, toVectorLiteral } from './embeddings';

export type AgentEventType =
  | 'chat_message'
  | 'mentioned'
  | 'card_assigned'
  | 'card_unassigned'
  | 'card_moved'
  | 'card_updated'
  | 'card_commented'
  | 'memory_written'
  | 'memory_retrieved'
  | 'project_memory_written'
  | 'project_memory_retrieved'
  | 'context_rewritten'
  | 'proposed_about_update'
  | 'skill_invoked'
  | 'subagent_spawned';

export async function logAgentActivity(agentId: string, eventType: AgentEventType, payload: Record<string, any>) {
  await prisma.agentActivityLog.create({ data: { agentId, eventType, payload } });
  await prisma.agentContextSnapshot.upsert({
    where: { agentId },
    create: { agentId, content: '', stale: true },
    update: { stale: true },
  });
}

export async function logAgentActivityBulk(agentIds: string[], eventType: AgentEventType, payload: Record<string, any>) {
  if (agentIds.length === 0) return;
  await Promise.all(agentIds.map((id) => logAgentActivity(id, eventType, payload)));
}

export async function getAgentsInProjectChannel(projectId: string): Promise<string[]> {
  const agents = await prisma.aIAgent.findMany({ where: { projectId, isActive: true }, select: { id: true } });
  return agents.map((a: { id: string }) => a.id);
}

export async function getAgentsOnCard(cardId: string): Promise<string[]> {
  const [card, members] = await Promise.all([
    prisma.card.findUnique({ where: { id: cardId }, select: { assigneeAgentId: true } }),
    prisma.cardMember.findMany({ where: { cardId, agentId: { not: null } }, select: { agentId: true } }),
  ]);
  const ids = new Set<string>();
  if (card?.assigneeAgentId) ids.add(card.assigneeAgentId);
  for (const m of members) if (m.agentId) ids.add(m.agentId);
  return [...ids];
}

export interface KanbanCardSummary {
  id: string;
  /** Human-facing key, e.g. "COOP-123". Falls back to id when prefix/number missing. */
  key: string;
  /** Canonical app path for this card (the URL agents should share in chat / comments). */
  url: string;
  title: string;
  priority: string;
  column: string;
  board: string;
  dueDate: Date | null;
  lastInteractedAt?: Date;
}

export async function getAgentKanbanContext(agentId: string): Promise<{
  assigned: KanbanCardSummary[];
  member: KanbanCardSummary[];
  interacted: KanbanCardSummary[];
}> {
  const cardSelect = {
    id: true, title: true, priority: true, dueDate: true,
    number: true, projectId: true,
    project: { select: { cardKeyPrefix: true } },
    column: { select: { name: true, board: { select: { name: true } } } },
  } as const;
  const [assignedCards, memberRows, recentEvents] = await Promise.all([
    prisma.card.findMany({
      where: { assigneeAgentId: agentId },
      select: cardSelect,
      orderBy: { updatedAt: 'desc' },
      take: 25,
    }),
    prisma.cardMember.findMany({
      where: { agentId },
      select: {
        card: {
          select: { ...cardSelect, assigneeAgentId: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 25,
    }),
    // Recent activity log entries that touched a card. Card-event payloads
    // (card_assigned, card_updated, card_moved, card_commented, card_unassigned)
    // all carry `cardId` — that's the unified signal for "the agent has
    // worked with / been notified about this card recently."
    prisma.agentActivityLog.findMany({
      where: { agentId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { eventType: true, payload: true, createdAt: true },
    }),
  ]);

  const toSummary = (c: any): KanbanCardSummary => {
    const prefix = c.project?.cardKeyPrefix as string | null | undefined;
    const hasKey = prefix && typeof c.number === 'number' && c.projectId;
    const key = hasKey ? formatCardKey(prefix!, c.number) : c.id;
    const url = hasKey ? pathForCardKey(c.projectId!, key) : '';
    return {
      id: c.id, key, url,
      title: c.title, priority: c.priority, dueDate: c.dueDate,
      column: c.column?.name ?? '?', board: c.column?.board?.name ?? '?',
    };
  };

  const assigned: KanbanCardSummary[] = assignedCards.map(toSummary);
  const assignedIds = new Set<string>(assigned.map((c: KanbanCardSummary) => c.id));

  const member: KanbanCardSummary[] = memberRows
    .map((m: any) => m.card)
    .filter((c: any) => c && c.assigneeAgentId !== agentId)
    .map(toSummary);
  const memberIds = new Set<string>(member.map((c: KanbanCardSummary) => c.id));

  // Build a deduped, freshness-ordered list of card IDs the agent has touched recently.
  const interactedFirstSeen = new Map<string, Date>();
  for (const ev of recentEvents as Array<{ eventType: string; payload: any; createdAt: Date }>) {
    const cid = typeof ev.payload?.cardId === 'string' ? ev.payload.cardId : null;
    if (!cid) continue;
    if (assignedIds.has(cid) || memberIds.has(cid)) continue;
    if (!interactedFirstSeen.has(cid)) interactedFirstSeen.set(cid, ev.createdAt);
  }

  let interacted: KanbanCardSummary[] = [];
  if (interactedFirstSeen.size > 0) {
    const ids = [...interactedFirstSeen.keys()].slice(0, 15);
    const cards = await prisma.card.findMany({
      where: { id: { in: ids } },
      select: cardSelect,
    });
    const byId = new Map(cards.map((c: any) => [c.id as string, c]));
    interacted = ids
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((c: any) => {
        const s = toSummary(c);
        const t = interactedFirstSeen.get(c.id);
        return t ? { ...s, lastInteractedAt: t } : s;
      });
  }

  return { assigned, member, interacted };
}

export interface HarnessContext {
  /** What triggered this run. Controls which protocol blocks get injected. */
  kind?: 'card' | 'chat' | 'dm' | 'webhook' | 'cron' | 'manual';
  /** The card the run is scoped to (only for kind='card'). */
  cardId?: string | null;
  /**
   * Free-text describing what the agent is being asked to do this run — the
   * incoming chat message, the card title+description, the cron prompt, etc.
   * Used by the memory-retrieval layer to embed against AgentMemory.embedding
   * and surface only the memories relevant to this turn instead of dumping
   * the whole list. When omitted (or when OPENAI_API_KEY is unset), the
   * harness falls back to the legacy load-everything behavior.
   */
  triggerText?: string;
}

interface RetrievedMemory {
  key: string;
  content: string;
  kind: string;
  /** Cosine similarity score in [-1, 1]. Undefined for rows pulled by the
   *  always-include rules (preferences, recent decisions outside top-K). */
  score?: number;
}

/**
 * Retrieve the memories the agent should see for this run.
 *
 * When `triggerText` is provided AND OPENAI_API_KEY is set, runs a top-12
 * cosine-ranked query, then UNIONs in:
 *   - all `kind='preference'` rows (user-set policy — always in the prompt)
 *   - all `kind='decision'` rows updated in the last 7 days (recency boost)
 * and dedups by id (the scored copy wins over the always-include copy when
 * a row qualifies for both). The retrieved keys + scores are written to
 * AgentActivityLog as a `memory_retrieved` event so the harness UI (Phase 4)
 * can show "what did this run actually load?".
 *
 * When triggerText is missing/empty OR embedding fails OR the API key is
 * unset, falls back to the legacy `findMany` path — byte-identical to the
 * pre–Memory-v1 behavior, so keyless / CLI-only deployments are unaffected.
 */
export async function retrieveMemories(agentId: string, triggerText: string | undefined): Promise<RetrievedMemory[]> {
  const fallback = async (): Promise<RetrievedMemory[]> => {
    const all = await prisma.agentMemory.findMany({
      where: { agentId },
      orderBy: [{ kind: 'asc' }, { updatedAt: 'desc' }],
    });
    return all.map((m: { key: string; content: string; kind: string }) => ({
      key: m.key,
      content: m.content,
      kind: m.kind,
    }));
  };

  if (!triggerText || !triggerText.trim() || !isEmbeddingEnabled()) {
    return fallback();
  }

  const queryVec = await embedText(triggerText);
  if (!queryVec) return fallback();

  const literal = toVectorLiteral(queryVec);

  // Three sources, deduped by id, scored row wins via DISTINCT ON + ORDER BY.
  // The float8 cast on score keeps the type stable across the UNION ALL — without
  // it Postgres widens NULL to text in some planner paths.
  type RawRow = { id: string; key: string; content: string; kind: string; score: number | null };
  const rows = await prisma.$queryRaw<RawRow[]>`
    WITH ranked AS (
      SELECT "id", "key", "content", "kind",
             (1 - ("embedding" <=> ${literal}::vector))::float8 AS score
      FROM "AgentMemory"
      WHERE "agentId" = ${agentId}
        AND "embedding" IS NOT NULL
      ORDER BY "embedding" <=> ${literal}::vector
      LIMIT 12
    ),
    prefs AS (
      SELECT "id", "key", "content", "kind", NULL::float8 AS score
      FROM "AgentMemory"
      WHERE "agentId" = ${agentId} AND "kind" = 'preference'
    ),
    recent_decisions AS (
      SELECT "id", "key", "content", "kind", NULL::float8 AS score
      FROM "AgentMemory"
      WHERE "agentId" = ${agentId}
        AND "kind" = 'decision'
        AND "updatedAt" >= NOW() - INTERVAL '7 days'
    )
    SELECT DISTINCT ON ("id") "id", "key", "content", "kind", "score"
    FROM (
      SELECT * FROM ranked
      UNION ALL SELECT * FROM prefs
      UNION ALL SELECT * FROM recent_decisions
    ) merged
    ORDER BY "id", "score" DESC NULLS LAST
  `;

  // Audit log: what did we actually pull for this turn? Bypasses logAgentActivity()
  // on purpose so the AgentContextSnapshot.stale flag isn't churned by every read
  // — that flag is meant to track state-changing events, not retrievals.
  if (rows.length > 0) {
    await prisma.agentActivityLog.create({
      data: {
        agentId,
        eventType: 'memory_retrieved',
        payload: {
          retrieved: rows.map((r: RawRow) => ({ key: r.key, score: r.score })),
          query: triggerText.slice(0, 200),
        },
      },
    });
  }

  return rows.map((r: RawRow) => ({
    key: r.key,
    content: r.content,
    kind: r.kind,
    score: r.score ?? undefined,
  }));
}

export async function compileHarness(agentId: string, ctx: HarnessContext = {}): Promise<string> {
  const [agent, memories, snapshot, recentActivity, kanban] = await Promise.all([
    prisma.aIAgent.findUnique({ where: { id: agentId } }),
    retrieveMemories(agentId, ctx.triggerText),
    prisma.agentContextSnapshot.findUnique({ where: { agentId } }),
    prisma.agentActivityLog.findMany({ where: { agentId }, orderBy: { createdAt: 'desc' }, take: 20 }),
    getAgentKanbanContext(agentId),
  ]);
  if (!agent) throw new Error('Agent not found');

  // Project-level doctrine: About (north star), USER.md (who you serve), AGENTS.md (rules of the house).
  // USER.md and AGENTS.md are admin-edited and inherited by every agent in the project.
  const project = agent.projectId
    ? await prisma.project.findUnique({
        where: { id: agent.projectId },
        select: {
          name: true,
          about: true, aboutUpdatedAt: true,
          userMd: true, userMdUpdatedAt: true,
          agentsMd: true, agentsMdUpdatedAt: true,
        },
      })
    : null;

  const parts: string[] = [];
  parts.push(`# ${agent.name} (${agent.roleLabel})`);
  if (agent.description) parts.push(agent.description);

  // SOUL.md — voice / persona, per agent. Goes high in the prompt so the
  // model adopts the voice before reading the operational instructions.
  if (agent.soulMd && agent.soulMd.trim()) {
    parts.push('\n## SOUL.md — your voice');
    parts.push(agent.soulMd.trim());
    parts.push('_(This is who you are. Speak from this. The rules below tell you what to do; SOUL tells you how you sound doing it.)_');
  }

  if (project) {
    parts.push(`\n## Project: ${project.name}`);
    if (project.about && project.about.trim()) {
      parts.push('### About this project (shared across all agents)');
      parts.push(project.about.trim());
      parts.push('\nIf your recent work implies this About section is out of date or incomplete, call the `propose_about_update` tool with the full replacement text and a short reason. The proposal is queued for human approval — do not mention or re-propose unless something material has actually changed.');
    } else {
      parts.push('_(No About section written yet. If the user describes scope or goals in conversation, consider calling `propose_about_update` with a first draft.)_');
    }

    // USER.md — admin-authored model of who the team / target user is.
    if (project.userMd && project.userMd.trim()) {
      parts.push('\n### USER.md — who you serve (set by project admins)');
      parts.push(project.userMd.trim());
      parts.push('_(Tailor every reply to this audience. Do not contradict or summarize this section back at the user.)_');
    }

    // AGENTS.md — admin-authored operational rules every agent in the project follows.
    if (project.agentsMd && project.agentsMd.trim()) {
      parts.push('\n### AGENTS.md — house rules (set by project admins)');
      parts.push(project.agentsMd.trim());
      parts.push('_(These rules override your role defaults when they conflict. If something here contradicts an instruction below, follow this.)_');
    }
  }
  parts.push('\n## System Prompt\n' + agent.systemPrompt);

  // Tool-usage hints. These live here (not on the tool description) because
  // they're about *when* and *how* to combine tools with replying, which the
  // LLM needs in context, not at tool-registration time.
  const effectivePlugins = agent.plugins && agent.plugins.length > 0
    ? agent.plugins
    : ['kanban', 'about', 'coding', 'scheduler'];
  if (effectivePlugins.includes('scheduler')) {
    parts.push(
      '\n## Scheduling\n' +
      'When the user asks you to remind them, do something later, or run something on a schedule, call `schedule_task` with `when` as `in:<N>s|m|h|d`, `at:<ISO>`, or `cron:<5-field expr>`, plus a clear `prompt` describing what the scheduled run should do. After scheduling, ALWAYS also reply in chat / add_comment to acknowledge — scheduling alone does not satisfy the user\'s request.');
  }

  // The Completion Protocol is ONLY relevant when the run is card-driven.
  // Chat/DM/webhook/cron runs are not about finishing a card — injecting this
  // block caused the agent to pick a random member card and comment on it.
  if (ctx.kind === 'card' || ctx.cardId) {
    parts.push(
      '\n## Completion Protocol\n' +
      (ctx.cardId ? `You are acting on card \`${ctx.cardId}\`. ` : '') +
      'When you finish whatever the card is asking you to do, you MUST reflect that on the card itself — do not just reply in chat and stop. Exactly one of these:\n' +
      '1. **Done** — if the card is fully complete, call `move_card` to a column named "Done" / "Shipped" / "Complete" (use `list_columns` if unsure which exists on the card\'s board). Post a brief `add_comment` summarizing what you did so humans and other agents have context.\n' +
      '2. **Follow-ups** — if your work uncovered new tasks that need doing (and you are confident they are actually needed), use `create_card` for each one, assign them with `assign_card` to the right teammate (call `list_boards` / `list_columns` to find the right backlog/todo column; pick humans for design/product decisions, coding agents for implementation), and link them from the parent card by passing `parentCardId` to `create_card` so they render as subtasks.\n' +
      '3. **In doubt** — if you\'re unsure whether the task is done, what should happen next, or who should pick it up, DO NOT silently create more work. Instead, `add_comment` on the card with a concise summary of what you did and a specific question for the user (e.g. "Should I also wire this into X, or is Y out of scope?"). Wait for a human reply before moving or creating follow-ups.\n' +
      'Subtasks are regular cards with a `parentCardId`. Treat each subtask as independently assignable and trackable. When all subtasks of a card are in the Done column, that is a strong signal the parent is ready to move too — but still apply judgment, don\'t auto-move mechanically.');
  } else if (ctx.kind === 'chat' || ctx.kind === 'dm') {
    parts.push(
      '\n## Chat Protocol\n' +
      '**No card mutations from chat.** You MUST NOT call `add_comment`, `move_card`, `update_card`, `create_card`, `assign_card`, `unassign_card`, `add_member`, `remove_member`, `create_checklist`, `toggle_checklist_item`, or any other card-mutating tool during this run. Reply in chat and stop.\n' +
      'Read-only kanban tools (`get_card`, `list_boards`, `list_columns`, `list_cards`, `list_comments`, `list_subtasks`) are always available — use them when the user\'s question needs board context. The Kanban section below is the starting point; call tools when you need more.');
  } else if (ctx.kind === 'webhook') {
    parts.push(
      '\n## Webhook Protocol\n' +
      'You were invoked by an inbound webhook. Decide whether the event needs a response; if not, say so and stop. **Do not call any card-mutating tool unless the payload explicitly names a card you own.**');
  } else if (ctx.kind === 'cron') {
    parts.push(
      '\n## Scheduled Protocol\n' +
      '**HARD RULE:** You were invoked by a scheduled tick. Your only goal is to produce a short text reply that fulfills the userPrompt. You MUST NOT call `add_comment`, `move_card`, `update_card`, `create_card`, `assign_card`, or any card-mutating tool. The reply is delivered automatically to the origin (chat room, card, etc.) — you do not need to post it yourself.');
  }

  if (memories.length > 0) {
    parts.push('\n## Memory');
    const byKind: Record<string, Array<{ key: string; content: string; kind: string }>> = {};
    for (const m of memories as Array<{ key: string; content: string; kind: string }>) {
      (byKind[m.kind] ||= []).push(m);
    }
    for (const [kind, items] of Object.entries(byKind)) {
      parts.push(`\n### ${kind}`);
      for (const m of items) parts.push(`- **${m.key}**: ${m.content}`);
    }
  }

  if (snapshot?.content) {
    parts.push('\n## Context Snapshot');
    if (snapshot.stale) parts.push('_(snapshot marked stale — recent activity has not been incorporated)_');
    parts.push(snapshot.content);
  }

  // Kanban context — always included so the agent can answer questions about
  // its work regardless of how it was invoked. What the agent is *allowed to do*
  // with that context is governed by the protocol blocks above (chat = no
  // mutations, cron = text reply only, etc.). This intentionally does NOT
  // branch on ctx.kind: the information stays consistent, the action policy is
  // separate from the visibility policy.
  {
    const fmtCard = (c: KanbanCardSummary) => {
      const due = c.dueDate ? ` (due ${c.dueDate.toISOString().slice(0, 10)})` : '';
      const seen = c.lastInteractedAt ? ` · last touched ${c.lastInteractedAt.toISOString().slice(0, 10)}` : '';
      const url = c.url ? ` · ${c.url}` : '';
      // Show the human-facing key as the primary label; the URL is the canonical
      // share-link, which the chat/comment renderer will collapse into a pill.
      return `- [${c.key}] ${c.title} — ${c.board}/${c.column} · ${c.priority}${due}${seen}${url}`;
    };
    const total = kanban.assigned.length + kanban.member.length + kanban.interacted.length;
    if (total > 0) {
      parts.push('\n## Kanban');
      if (kanban.assigned.length > 0) {
        parts.push(`\n### Assigned to you (${kanban.assigned.length})`);
        for (const c of kanban.assigned) parts.push(fmtCard(c));
      }
      if (kanban.member.length > 0) {
        parts.push(`\n### Cards you are a member of (${kanban.member.length})`);
        for (const c of kanban.member) parts.push(fmtCard(c));
      }
      if (kanban.interacted.length > 0) {
        parts.push(`\n### Recently interacted with (${kanban.interacted.length})`);
        for (const c of kanban.interacted) parts.push(fmtCard(c));
      }
      parts.push('\nThe entries above are summaries. Call `get_card` with the key (e.g. `COOP-123`) or the cuid for full description, checklists, comments, members, and due date. Use `list_boards` / `list_columns` / `list_cards` to explore beyond what\'s shown here. When you reference a card in chat or comments, use either the key (`COOP-123`) or the URL — both render as a clickable pill. Whether you can mutate these cards depends on the protocol section above — this list is for awareness, not an invitation to act.');
    } else {
      parts.push('\n## Kanban\n_No cards are currently assigned to you, no shared cards, no recent card activity._\nUse `list_boards` → `list_columns` → `list_cards` to explore the board, and `get_card` to load full details before discussing or acting on any card.');
    }
  }

  if (recentActivity.length > 0) {
    parts.push('\n## Recent Activity');
    for (const a of recentActivity) {
      parts.push(`- [${a.createdAt.toISOString()}] ${a.eventType}: ${JSON.stringify(a.payload)}`);
    }
  }

  return parts.join('\n');
}

export async function verifyAgentAccess(agentId: string, userId: string): Promise<{ ok: true; projectId: string } | { ok: false; status: number }> {
  const agent = await prisma.aIAgent.findUnique({ where: { id: agentId }, select: { id: true, projectId: true } });
  if (!agent || !agent.projectId) return { ok: false, status: 404 };
  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId: agent.projectId, userId } },
  });
  if (!membership) return { ok: false, status: 403 };
  return { ok: true, projectId: agent.projectId };
}
