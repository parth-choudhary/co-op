import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import prisma from './db';
import { compileHarness, logAgentActivity, type HarnessContext } from './agentHarness';
import { tryDecrypt } from './crypto';
import { sendMessage as matrixSendMessage, joinRoomAs, inviteUserToRoom } from './matrix';
import { executeAction, type AgentAction } from './agentActions';
import { getAnthropicTools, getOpenAITools } from './agentTools';
import { resolveToolsForAgent, findToolByName } from './plugins/registry';
import type { PluginToolSpec, RunFrame } from './plugins/contract';
import { getApiKey, isCliProvider } from './agentApiKeys';
import { runAgentViaCli } from './agentCliRunner';
import { resolveCardId } from './cardKeyAssign';
import {
  fetchChatHistoryShared,
  fetchCardHistoryShared,
  formatHistoryForAgent,
  type PriorMessage,
  type SharedFetchResult,
} from './chatHistory';

export interface RunOptions {
  agentId: string;
  userPrompt: string;
  maxTokens?: number;
  extraContext?: string;
  enableTools?: boolean;
  maxToolRounds?: number;
  runId?: string;
  /** Execution context — tells the harness whether to inject card-completion protocol, chat guardrails, etc. */
  harnessContext?: HarnessContext;
  /** Delivery hint — where side-effects initiated during this run should land. */
  delivery?: import('./plugins/contract').DeliveryTarget;
  /**
   * Conversation turns that happened before `userPrompt`. Spliced into the
   * provider message list so the model treats its own past replies as its own
   * voice (not background context). Built by the chatHistory layer.
   */
  priorMessages?: PriorMessage[];
}

// Build a combined tool schema list: plugin tools (deduped by name) union legacy kanbanTools.
// Legacy getAnthropicTools()/getOpenAITools() still ship kanban+coding tools, so dedupe.
function buildPluginToolSpecs(enabledPlugins: string[]): PluginToolSpec[] {
  return resolveToolsForAgent(enabledPlugins);
}

// Narrow the free-form modelProvider string to the providers our chatHistory
// summary layer supports. Anything else → 'anthropic' as a safe fallback (the
// summary fetch will short-circuit to no-op if the API key isn't there).
function providerOf(modelProvider: string): 'anthropic' | 'openai' {
  return modelProvider === 'openai' ? 'openai' : 'anthropic';
}

/**
 * For chat history: the just-arrived message may also appear as the most recent
 * Matrix event in the fetched timeline (race between bridge → handler vs Synapse
 * indexing). If so, drop it from priorMessages so the model sees it once via
 * userPrompt rather than as a duplicated trailing turn.
 *
 * Match heuristic: the trailing user-role turn's content ends with the new
 * userPrompt (sender prefix may be in front). We don't have the Matrix event id
 * so this is content-based; cheap and effective.
 */
function dropTrailingMatchingTurn(messages: PriorMessage[], newContent: string): PriorMessage[] {
  if (messages.length === 0) return messages;
  const last = messages[messages.length - 1];
  if (last.role !== 'user') return messages;
  // Strip trailing whitespace and the optional "[Sender]: " prefix before comparing.
  const stripped = last.content.replace(/^\[[^\]]+\]:\s*/, '').trimEnd();
  if (stripped === newContent.trimEnd()) {
    return messages.slice(0, -1);
  }
  return messages;
}

async function executePluginOrAction(
  toolName: string,
  input: Record<string, unknown>,
  agentId: string,
  projectId: string | null,
  runId: string | undefined,
  frame: RunFrame,
  delivery?: import('./plugins/contract').DeliveryTarget,
) {
  // Transparent key→cuid resolution: any input field that holds a card identifier
  // accepts either the cuid or the human-facing key like "COOP-123". Resolution
  // happens here so individual tool handlers don't have to repeat it.
  const resolvedInput = await resolveCardIdInputs(input, projectId);

  const tool = findToolByName(toolName);
  if (tool) {
    return tool.handler({ agentId, projectId, runId, frame, delivery }, resolvedInput);
  }
  const action = { type: toolName, ...resolvedInput } as AgentAction;
  return executeAction(agentId, action);
}

/** Walk known card-id fields in a tool input object and rewrite any key-shaped
 *  values (e.g. "COOP-123") to the underlying cuid. Unknown fields pass through
 *  untouched. Project scope (the agent's project) is used to disambiguate keys. */
async function resolveCardIdInputs(
  input: Record<string, unknown>,
  projectId: string | null,
): Promise<Record<string, unknown>> {
  const fields = ['cardId', 'parentCardId'];
  const out = { ...input };
  for (const f of fields) {
    const v = out[f];
    if (typeof v !== 'string' || v.length === 0) continue;
    // Cheap shape gate: only call the resolver if it looks like a key. Cuids
    // never contain a hyphen or uppercase letters.
    if (!/^[A-Z][A-Z0-9]{1,5}-\d+$/.test(v)) continue;
    const resolved = await resolveCardId(v, projectId);
    if (resolved) out[f] = resolved;
  }
  return out;
}

export interface RunResult {
  text: string;
  provider: string;
  model: string;
  usage?: { inputTokens?: number; outputTokens?: number };
  toolResults?: Array<{ tool: string; input: any; result: any }>;
}

export async function runAgent(opts: RunOptions): Promise<RunResult> {
  const agent = await prisma.aIAgent.findUnique({ where: { id: opts.agentId } });
  if (!agent) throw new Error('Agent not found');
  if (!agent.isActive) throw new Error('Agent is inactive');

  const apiKey = await getApiKey(agent.projectId, agent.modelProvider);
  if (!apiKey) throw new Error(`No API key configured for ${agent.modelProvider}`);

  // Default triggerText to the userPrompt so the harness can pull relevant
  // memories without every caller having to populate it explicitly. Callers
  // with richer context (e.g. card-driven runs that want title+description)
  // can override by setting harnessContext.triggerText themselves.
  const baseCtx = opts.harnessContext || {};
  const triggerText = baseCtx.triggerText ?? opts.userPrompt;
  const system = await compileHarness(opts.agentId, { ...baseCtx, triggerText });
  const userContent = opts.extraContext
    ? `${opts.extraContext}\n\n---\n\n${opts.userPrompt}`
    : opts.userPrompt;

  const enableTools = opts.enableTools ?? true;
  const maxRounds = opts.maxToolRounds ?? 5;

  let result: RunResult;

  const frame: RunFrame = { grantedCapabilities: [] };
  const pluginSpecs = buildPluginToolSpecs(agent.plugins || []);

  if (agent.modelProvider === 'anthropic') {
    result = await runAnthropic(apiKey, agent, system, userContent, enableTools, maxRounds, opts, frame, pluginSpecs);
  } else if (agent.modelProvider === 'openai') {
    result = await runOpenAI(apiKey, agent, system, userContent, enableTools, maxRounds, opts, frame, pluginSpecs);
  } else if (isCliProvider(agent.modelProvider)) {
    // CLI runtimes: shell out to a locally-installed agent binary. No tool
    // dispatch — the CLI runs its own loop. We treat it as text-in / text-out.
    result = await runAgentViaCli({
      provider: agent.modelProvider as 'claude-cli' | 'codex-cli',
      modelName: agent.modelName,
      systemPrompt: systemWithFrame(system, frame),
      userPrompt: userContent,
    });
  } else {
    throw new Error(`Unsupported provider: ${agent.modelProvider}`);
  }

  if (!isCliProvider(agent.modelProvider)) {
    await prisma.modelKey.updateMany({
      where: { projectId: agent.projectId, provider: agent.modelProvider },
      data: { lastUsedAt: new Date() },
    });
  }

  return result;
}

function mergeAnthropicTools(
  legacy: Anthropic.Tool[],
  pluginSpecs: PluginToolSpec[],
): Anthropic.Tool[] {
  const have = new Set(legacy.map((t) => t.name));
  const extra: Anthropic.Tool[] = pluginSpecs
    .filter((p) => !have.has(p.name))
    .map((p) => ({
      name: p.name,
      description: p.description,
      input_schema: p.parameters as Anthropic.Tool['input_schema'],
    }));
  return [...legacy, ...extra];
}

function mergeOpenAITools(
  legacy: OpenAI.ChatCompletionTool[],
  pluginSpecs: PluginToolSpec[],
): OpenAI.ChatCompletionTool[] {
  const have = new Set(legacy.map((t) => (t as any).function?.name));
  const extra: OpenAI.ChatCompletionTool[] = pluginSpecs
    .filter((p) => !have.has(p.name))
    .map((p) => ({
      type: 'function' as const,
      function: { name: p.name, description: p.description, parameters: p.parameters },
    }));
  return [...legacy, ...extra];
}

function systemWithFrame(base: string, frame: RunFrame): string {
  if (!frame.promptAppendix) return base;
  return base + '\n\n---\n\n' + frame.promptAppendix;
}

async function runAnthropic(
  apiKey: string, agent: any, system: string, userContent: string,
  enableTools: boolean, maxRounds: number, opts: RunOptions,
  frame: RunFrame, pluginSpecs: PluginToolSpec[],
): Promise<RunResult> {
  const client = new Anthropic({ apiKey });
  const tools = enableTools ? mergeAnthropicTools(getAnthropicTools(), pluginSpecs) : [];
  const messages: Anthropic.MessageParam[] = [
    ...(opts.priorMessages?.map((m) => ({ role: m.role, content: m.content })) ?? []),
    { role: 'user' as const, content: userContent },
  ];
  const allToolResults: RunResult['toolResults'] = [];
  let totalInput = 0;
  let totalOutput = 0;

  for (let round = 0; round <= maxRounds; round++) {
    const resp = await client.messages.create({
      model: agent.modelName,
      max_tokens: opts.maxTokens ?? 1024,
      system: systemWithFrame(system, frame),
      messages,
      temperature: agent.temperature ?? 0.7,
      ...(tools.length > 0 ? { tools } : {}),
    });

    totalInput += resp.usage?.input_tokens ?? 0;
    totalOutput += resp.usage?.output_tokens ?? 0;

    if (resp.stop_reason !== 'tool_use' || round === maxRounds) {
      const text = resp.content
        .filter((b: any) => b.type === 'text')
        .map((b: any) => b.text)
        .join('\n');
      return {
        text,
        provider: 'anthropic',
        model: agent.modelName,
        usage: { inputTokens: totalInput, outputTokens: totalOutput },
        toolResults: allToolResults.length > 0 ? allToolResults : undefined,
      };
    }

    messages.push({ role: 'assistant', content: resp.content });

    const toolUseBlocks = resp.content.filter((b: any) => b.type === 'tool_use') as Anthropic.ToolUseBlock[];
    const toolResultContent: Anthropic.ToolResultBlockParam[] = [];

    for (const toolUse of toolUseBlocks) {
      const input = toolUse.input as Record<string, unknown>;
      const result = await executePluginOrAction(
        toolUse.name, input, opts.agentId, agent.projectId, opts.runId, frame, opts.delivery,
      );
      allToolResults.push({ tool: toolUse.name, input: toolUse.input, result });
      toolResultContent.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: JSON.stringify(result),
      });
    }

    messages.push({ role: 'user', content: toolResultContent });
  }

  return { text: '', provider: 'anthropic', model: agent.modelName, usage: { inputTokens: totalInput, outputTokens: totalOutput }, toolResults: allToolResults.length > 0 ? allToolResults : undefined };
}

async function runOpenAI(
  apiKey: string, agent: any, system: string, userContent: string,
  enableTools: boolean, maxRounds: number, opts: RunOptions,
  frame: RunFrame, pluginSpecs: PluginToolSpec[],
): Promise<RunResult> {
  const client = new OpenAI({ apiKey });
  const tools = enableTools ? mergeOpenAITools(getOpenAITools(), pluginSpecs) : undefined;
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemWithFrame(system, frame) },
    ...(opts.priorMessages?.map((m) => ({ role: m.role, content: m.content })) ?? []),
    { role: 'user' as const, content: userContent },
  ];
  const allToolResults: RunResult['toolResults'] = [];
  let totalInput = 0;
  let totalOutput = 0;

  for (let round = 0; round <= maxRounds; round++) {
    const resp = await client.chat.completions.create({
      model: agent.modelName,
      max_tokens: opts.maxTokens ?? 1024,
      temperature: agent.temperature ?? 0.7,
      messages,
      ...(tools ? { tools } : {}),
    });

    totalInput += resp.usage?.prompt_tokens ?? 0;
    totalOutput += resp.usage?.completion_tokens ?? 0;

    const choice = resp.choices[0];
    if (!choice) break;

    if (choice.finish_reason !== 'tool_calls' || !choice.message.tool_calls?.length || round === maxRounds) {
      return {
        text: choice.message.content || '',
        provider: 'openai',
        model: agent.modelName,
        usage: { inputTokens: totalInput, outputTokens: totalOutput },
        toolResults: allToolResults.length > 0 ? allToolResults : undefined,
      };
    }

    messages.push(choice.message);

    for (const toolCall of choice.message.tool_calls) {
      const tc = toolCall as any;
      const fnInput = JSON.parse(tc.function.arguments);
      const result = await executePluginOrAction(
        tc.function.name, fnInput, opts.agentId, agent.projectId, opts.runId, frame, opts.delivery,
      );
      allToolResults.push({ tool: tc.function.name, input: fnInput, result });
      messages.push({
        role: 'tool' as const,
        tool_call_id: tc.id,
        content: JSON.stringify(result),
      });
    }
    // Refresh system message so skill frame appendix activates on next round.
    messages[0] = { role: 'system', content: systemWithFrame(system, frame) };
  }

  return { text: '', provider: 'openai', model: agent.modelName, usage: { inputTokens: totalInput, outputTokens: totalOutput }, toolResults: allToolResults.length > 0 ? allToolResults : undefined };
}

// Synthesize a short human-facing acknowledgment when the LLM chose to call
// tools but produced no final text. Picks the most informative tool output.
export function summarizeToolResults(toolResults: Array<{ tool: string; input: unknown; result: any }>): string {
  for (const t of toolResults) {
    if (!t.result?.ok) continue;
    if (t.tool === 'schedule_task') {
      const d = t.result.data || {};
      const when = d.nextRunAt ? new Date(d.nextRunAt).toLocaleString() : 'later';
      return d.title ? `Scheduled "${d.title}" for ${when}.` : `Scheduled for ${when}.`;
    }
    if (t.tool === 'add_comment') {
      return 'Commented on the card.';
    }
    if (t.tool === 'create_card') {
      return `Created card "${t.result.data?.title || ''}".`;
    }
    if (t.tool === 'move_card') {
      return 'Moved the card.';
    }
    if (t.tool === 'use_skill') {
      return `Ran skill \`${t.result.data?.slug || '?'}\`.`;
    }
  }
  return 'Done.';
}

export function extractMentions(content: string): string[] {
  const matches = content.match(/@[\w.\-:]+/g) || [];
  return [...new Set(matches.map((m) => m.slice(1).toLowerCase()))];
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function mentionAliases(agent: { name: string; role?: string | null; roleLabel?: string | null; matrixLocalpart?: string | null; matrixUserId?: string | null }): string[] {
  const aliases = new Set<string>();
  const add = (s: string | null | undefined) => {
    if (!s) return;
    aliases.add(normalize(s));
    aliases.add(s.toLowerCase().replace(/\s+/g, '-'));
    aliases.add(s.toLowerCase().replace(/\s+/g, '_'));
    aliases.add(s.toLowerCase().split(/\s+/)[0]);
  };
  add(agent.name);
  add(agent.role || undefined);
  add(agent.roleLabel || undefined);
  if (agent.matrixLocalpart) aliases.add(agent.matrixLocalpart.toLowerCase());
  if (agent.matrixUserId) {
    const localpart = agent.matrixUserId.replace(/^@/, '').split(':')[0];
    aliases.add(localpart.toLowerCase());
  }
  aliases.delete('');
  return [...aliases];
}

export function matchMentionsToAgents<T extends { id: string; name: string; role?: string | null; roleLabel?: string | null; matrixLocalpart?: string | null; matrixUserId?: string | null }>(
  content: string,
  agents: T[]
): T[] {
  const mentions = extractMentions(content).map(normalize);
  if (mentions.length === 0) return [];
  return agents.filter((a) => {
    const aliases = mentionAliases(a).map(normalize);
    return mentions.some((m) => aliases.includes(m));
  });
}

export async function handleCardComment(opts: {
  cardId: string;
  commentId: string;
  parentCommentId: string | null;
  content: string;
  senderName: string;
}): Promise<void> {
  const card = await prisma.card.findUnique({
    where: { id: opts.cardId },
    select: {
      id: true, title: true, assigneeAgentId: true,
      column: { select: { name: true, board: { select: { projectId: true, name: true } } } },
      members: { select: { agentId: true } },
    },
  });
  if (!card) return;
  const projectId = card.column?.board?.projectId;
  if (!projectId) return;

  const projectAgents: Array<{
    id: string; name: string; isActive: boolean; role: string | null; roleLabel: string | null;
    matrixUserId: string | null; matrixLocalpart: string | null; modelProvider: string;
  }> = await prisma.aIAgent.findMany({
    where: { projectId, isActive: true },
    select: { id: true, name: true, isActive: true, role: true, roleLabel: true, matrixUserId: true, matrixLocalpart: true, modelProvider: true },
  });

  const triggered = new Set<string>();

  // 1. @-mentions inside the comment
  const mentioned = matchMentionsToAgents(opts.content, projectAgents);
  for (const m of mentioned) triggered.add(m.id);

  // 2. If this is a reply to an agent's comment, trigger that agent
  if (opts.parentCommentId) {
    const parent = await prisma.comment.findUnique({
      where: { id: opts.parentCommentId },
      select: { authorType: true, authorId: true },
    });
    if (parent?.authorType === 'agent' && projectAgents.some((a) => a.id === parent.authorId)) {
      triggered.add(parent.authorId);
    }
  }

  if (triggered.size === 0) return;

  const boardName = card.column?.board?.name || '';
  const columnName = card.column?.name || '';
  const extraContext = `You were mentioned on kanban card "${card.title}" (${boardName}/${columnName}, id: ${card.id}) by ${opts.senderName}.` +
    (opts.parentCommentId ? ` This is a reply to an earlier comment (id: ${opts.parentCommentId}).` : '') +
    `\n\nRespond by calling the \`add_comment\` tool with cardId: "${card.id}"` +
    (opts.parentCommentId ? ` and parentCommentId: "${opts.parentCommentId}" to keep the thread` : '') +
    `. Keep replies concise. Use \`get_card\` or \`list_comments\` first if you need more context.`;

  // Shared fetch+summarize for the card's comment thread. Provider comes from
  // the first triggered agent — in mixed-provider rooms whichever fires first
  // pays the (cheap) summary cost. The summary blob itself is provider-neutral.
  const firstTriggered = projectAgents.find((a) => triggered.has(a.id));
  let cardHistoryFetch: SharedFetchResult | null = null;
  if (firstTriggered) {
    try {
      cardHistoryFetch = await fetchCardHistoryShared({
        cardId: card.id,
        projectId,
        provider: providerOf(firstTriggered.modelProvider),
      });
    } catch (err: any) {
      console.warn(`[handleCardComment] history fetch failed for card ${card.id}:`, err?.message || err);
    }
  }

  await Promise.all([...triggered].map(async (agentId) => {
    try {
      const agentMeta = projectAgents.find((a) => a.id === agentId);
      const priorMessages = cardHistoryFetch && agentMeta
        ? formatHistoryForAgent({
            fetched: cardHistoryFetch,
            self: { agentId, matrixUserId: agentMeta.matrixUserId },
            // The new comment is already in the DB by the time we fetch — drop
            // it from priorMessages so the model sees it once (as userPrompt).
            excludeTurnId: opts.commentId,
          })
        : undefined;

      const res = await runAgent({
        agentId,
        userPrompt: opts.content,
        extraContext,
        enableTools: true,
        harnessContext: { kind: 'card', cardId: card.id },
        delivery: { cardId: card.id, replyToCommentId: opts.parentCommentId || undefined },
        priorMessages,
      });
      // If the agent produced no text AND didn't call add_comment, drop a
      // system comment so the mention doesn't go silent.
      const posted = res.toolResults?.some((t) => t.tool === 'add_comment' && t.result?.ok);
      if (!posted) {
        const body = res.text?.trim()
          ? res.text.trim()
          : (res.toolResults?.length ? summarizeToolResults(res.toolResults) : '');
        if (body) {
          await prisma.comment.create({
            data: {
              cardId: card.id,
              content: body,
              authorType: 'agent',
              authorId: agentId,
              parentCommentId: opts.parentCommentId || null,
            },
          });
        } else {
          console.warn(`[handleCardComment] agent ${agentId} produced no text and no add_comment — mention silent`);
        }
      }
    } catch (err: any) {
      console.error(`[handleCardComment] agent ${agentId} failed:`, err?.message || err);
      // Surface the error as a comment so the mention doesn't vanish.
      try {
        await prisma.comment.create({
          data: {
            cardId: card.id,
            content: `_(agent run failed: ${String(err?.message || err).slice(0, 200)})_`,
            authorType: 'agent',
            authorId: agentId,
            parentCommentId: opts.parentCommentId || null,
          },
        });
      } catch {}
    }
  }));
}

export async function handleChatMessage(opts: {
  projectId: string;
  roomId: string;
  matrixRoomId?: string | null;
  roomName?: string;
  sender: string;
  content: string;
  isAgent?: boolean;
  postReplies?: boolean;
  inviterToken?: string;
}): Promise<{ agentIds: string[]; mentionedAgentIds: string[]; replies: Array<{ agentId: string; text: string; error?: string; posted?: boolean; toolResults?: RunResult['toolResults'] }> }> {
  const agents: Array<{
    id: string; name: string; isActive: boolean; role: string | null; roleLabel: string | null;
    matrixUserId: string | null; matrixLocalpart: string | null; matrixAccessToken: string | null;
    modelProvider: string;
  }> = await prisma.aIAgent.findMany({
    where: { projectId: opts.projectId, isActive: true },
    select: { id: true, name: true, isActive: true, role: true, roleLabel: true, matrixUserId: true, matrixLocalpart: true, matrixAccessToken: true, modelProvider: true },
  });
  const agentIds = agents.map((a) => a.id);
  const mentioned = matchMentionsToAgents(opts.content, agents);
  const mentionedIds = new Set(mentioned.map((a) => a.id));

  // In a DM where the counterpart is an agent, every message should trigger that agent — no @mention needed
  let dmAgent: (typeof agents)[number] | null = null;
  if (opts.roomId) {
    const channel = await prisma.chatChannel.findUnique({
      where: { id: opts.roomId },
      include: { members: true },
    }).catch(() => null);
    if (channel && channel.kind === 'dm') {
      const agentMember = channel.members.find((m: any) => m.agentId);
      if (agentMember) {
        const match = agents.find((a) => a.id === agentMember.agentId);
        if (match && !mentionedIds.has(match.id)) {
          dmAgent = match;
          mentioned.push(match);
          mentionedIds.add(match.id);
        }
      }
    }
  }

  await Promise.all(
    agentIds.map((id) =>
      logAgentActivity(id, mentionedIds.has(id) ? 'mentioned' : 'chat_message', {
        roomId: opts.roomId,
        roomName: opts.roomName,
        sender: opts.sender,
        excerpt: opts.content.slice(0, 500),
      })
    )
  );

  const replies: Array<{ agentId: string; text: string; error?: string; posted?: boolean; toolResults?: RunResult['toolResults'] }> = [];
  if (opts.isAgent) return { agentIds, mentionedAgentIds: [...mentionedIds], replies };

  // Shared fetch+summarize for the room. Uses the first triggered agent's matrix
  // token + provider; the resulting RawTurn[] and rolling summary are reused
  // across every agent's per-run formatting below.
  let chatHistoryFetch: SharedFetchResult | null = null;
  if (mentioned.length > 0 && opts.matrixRoomId) {
    const fetcher = mentioned.find((a) => a.matrixAccessToken && a.matrixUserId) ?? mentioned[0];
    const fetcherToken = fetcher.matrixAccessToken ? tryDecrypt(fetcher.matrixAccessToken) : null;
    if (fetcherToken) {
      try {
        chatHistoryFetch = await fetchChatHistoryShared({
          channelId: opts.roomId,
          matrixRoomId: opts.matrixRoomId,
          matrixAccessToken: fetcherToken,
          projectId: opts.projectId,
          provider: providerOf(fetcher.modelProvider),
        });
      } catch (err: any) {
        console.warn(`[handleChatMessage] history fetch failed for room ${opts.roomId}:`, err?.message || err);
      }
    }
  }

  for (const agent of mentioned) {
    const agentToken = agent.matrixAccessToken ? tryDecrypt(agent.matrixAccessToken) : null;
    // Signal "agent is typing" in Matrix while the LLM is running
    if (opts.matrixRoomId && agentToken && agent.matrixUserId) {
      await joinRoomAs(opts.matrixRoomId, agentToken).catch(() => false);
      const { setTyping } = await import('./matrix');
      await setTyping(opts.matrixRoomId, agent.matrixUserId, agentToken, true);
    }
    try {
      const priorMessages = chatHistoryFetch
        ? dropTrailingMatchingTurn(
            formatHistoryForAgent({
              fetched: chatHistoryFetch,
              self: { agentId: agent.id, matrixUserId: agent.matrixUserId },
            }),
            opts.content,
          )
        : undefined;

      const res = await runAgent({
        agentId: agent.id,
        userPrompt: opts.content,
        extraContext: `You were mentioned in chat room "${opts.roomName || opts.roomId}" by ${opts.sender}. Reply concisely in chat. Only modify kanban cards if the user explicitly asks you to in this message.`,
        enableTools: true,
        harnessContext: { kind: dmAgent ? 'dm' : 'chat' },
        delivery: { roomId: opts.roomId, matrixRoomId: opts.matrixRoomId || undefined },
        priorMessages,
      });
      const reply: typeof replies[number] = { agentId: agent.id, text: res.text, toolResults: res.toolResults };

      // Guard: if the LLM returned only tool calls (e.g. scheduled a reminder)
      // and no text, synthesize a short acknowledgment so the user isn't left
      // staring at a silent chat. Describe what was done.
      let effectiveText = res.text;
      if (!effectiveText.trim() && res.toolResults && res.toolResults.length > 0) {
        effectiveText = summarizeToolResults(res.toolResults);
      }

      if (opts.postReplies && opts.matrixRoomId && agentToken) {
        if (opts.inviterToken && agent.matrixUserId) {
          await inviteUserToRoom(opts.matrixRoomId, agent.matrixUserId, opts.inviterToken).catch(() => false);
        }
        if (effectiveText.trim()) {
          try {
            await matrixSendMessage(opts.matrixRoomId, agentToken, effectiveText);
            reply.posted = true;
            reply.text = effectiveText;
          } catch (e: any) {
            console.error(`[handleChatMessage] matrix send failed for agent ${agent.id}:`, e?.message || e);
            reply.error = `matrix send: ${e.message}`;
          }
        } else {
          console.warn(`[handleChatMessage] agent ${agent.id} produced empty response — nothing to post`);
          reply.error = 'empty response';
        }
      }

      replies.push(reply);
    } catch (err: any) {
      console.error(`[handleChatMessage] agent ${agent.id} runAgent threw:`, err?.message || err);
      replies.push({ agentId: agent.id, text: '', error: err?.message || String(err) });
      // Best-effort: post a short diagnostic to chat so the user sees something happened.
      if (opts.postReplies && opts.matrixRoomId && agentToken && process.env.CHAT_SURFACE_ERRORS !== '0') {
        try { await matrixSendMessage(opts.matrixRoomId, agentToken, `_(agent run failed: ${String(err?.message || err).slice(0, 200)})_`); } catch {}
      }
    } finally {
      // Always clear typing, even if the LLM/post failed
      if (opts.matrixRoomId && agentToken && agent.matrixUserId) {
        const { setTyping } = await import('./matrix');
        await setTyping(opts.matrixRoomId, agent.matrixUserId, agentToken, false);
      }
    }
  }

  return { agentIds, mentionedAgentIds: [...mentionedIds], replies };
}
