import prisma from '@/lib/db';
import { dispatchRun } from './dispatch';

export type TriggerKind = 'column_move' | 'assignment' | 'comment' | 'manual';

export interface TriggerEvent {
  kind: TriggerKind;
  cardId: string;
  // Extra context for each kind:
  toColumnId?: string;       // column_move
  assigneeAgentId?: string;  // assignment
  commentText?: string;      // comment
  commentAuthorType?: 'user' | 'agent'; // comment
  actorUserId?: string | null;
  actorAgentId?: string | null;
}

export interface TriggerDecision {
  shouldRun: boolean;
  reason: string;
  runId?: string;
}

const START_INTENT = /(?:^|\s)@\S+\s+(?:start|go|begin|run|ship|execute)\b/i;

// Does this comment read like an explicit "agent, start" command?
export function commentHasStartIntent(text: string): boolean {
  return START_INTENT.test(text);
}

// Evaluate an event against the project's ProjectCodeConfig. If we decide to
// run, create the AgentTaskRun, mirror onto Card.activeRunId, and dispatch.
// Returns an informational decision either way — callers should fire-and-forget
// and surface errors via logs, not user-facing failures.
export async function evaluateAndMaybeDispatch(event: TriggerEvent): Promise<TriggerDecision> {
  const card = await prisma.card.findUnique({
    where: { id: event.cardId },
    select: {
      id: true, title: true, columnId: true, activeRunId: true, assigneeAgentId: true,
      column: { select: { board: { select: { projectId: true } } } },
    },
  });
  if (!card) return { shouldRun: false, reason: 'card not found' };
  const projectId = card.column?.board?.projectId;
  if (!projectId) return { shouldRun: false, reason: 'project not found' };

  const cfg = await prisma.projectCodeConfig.findUnique({ where: { projectId } });
  if (!cfg) return { shouldRun: false, reason: 'code automation not configured' };

  if (card.activeRunId) return { shouldRun: false, reason: 'run already active for card' };

  // Per-kind gates
  switch (event.kind) {
    case 'column_move':
      if (!cfg.triggerOnColumnMove) return { shouldRun: false, reason: 'column_move trigger disabled' };
      if (!cfg.triggerColumnIds?.length) return { shouldRun: false, reason: 'no trigger columns configured' };
      if (!event.toColumnId || !cfg.triggerColumnIds.includes(event.toColumnId)) {
        return { shouldRun: false, reason: 'column is not a trigger column' };
      }
      break;
    case 'assignment':
      if (!cfg.triggerOnAssign) return { shouldRun: false, reason: 'assignment trigger disabled' };
      if (!event.assigneeAgentId) return { shouldRun: false, reason: 'assigned to non-agent' };
      break;
    case 'comment':
      if (!cfg.triggerOnComment) return { shouldRun: false, reason: 'comment trigger disabled' };
      if (event.commentAuthorType === 'agent') return { shouldRun: false, reason: 'agent comments do not trigger runs' };
      if (!event.commentText || !commentHasStartIntent(event.commentText)) return { shouldRun: false, reason: 'no start intent in comment' };
      break;
    case 'manual':
      if (!cfg.triggerOnManual) return { shouldRun: false, reason: 'manual trigger disabled' };
      break;
  }

  const agentId = event.assigneeAgentId || card.assigneeAgentId;
  if (!agentId) return { shouldRun: false, reason: 'card has no agent assignee' };

  // Atomic claim via UPDATE…WHERE activeRunId IS NULL to avoid races between
  // rapid-fire events (column move immediately after assignment, etc.)
  const run = await prisma.agentTaskRun.create({
    data: {
      projectId,
      cardId: card.id,
      agentId,
      triggerKind: event.kind,
      executionMode: cfg.executionMode,
      status: 'queued',
    },
  });
  const claim = await prisma.card.updateMany({
    where: { id: card.id, activeRunId: null },
    data: { activeRunId: run.id },
  });
  if (claim.count === 0) {
    // Someone else claimed it first — roll the row back.
    await prisma.agentTaskRun.update({
      where: { id: run.id },
      data: { status: 'cancelled', finishedAt: new Date(), errorMessage: 'superseded by another trigger' },
    });
    return { shouldRun: false, reason: 'another run was claimed concurrently' };
  }

  await prisma.cardActivity.create({
    data: {
      cardId: card.id, type: 'agent_run_queued',
      content: `queued coding agent via ${event.kind}`,
      actorId: event.actorAgentId || event.actorUserId || agentId,
      actorType: event.actorAgentId ? 'agent' : 'user',
    },
  });

  // Dispatch asynchronously — the triggering HTTP request shouldn't block on
  // GitHub API latency.
  dispatchRun(run.id).catch((err) => {
    console.error(`[trigger:${event.kind}] dispatchRun ${run.id} failed`, err?.message || err);
  });

  return { shouldRun: true, reason: `triggered via ${event.kind}`, runId: run.id };
}
