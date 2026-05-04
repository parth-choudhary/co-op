import prisma from './db';
import { appendRunEvent } from './runEvents';

// M1 Phase 1 / Plan 01-01.4 — run lifecycle helpers.
//
// startRun creates the AgentTaskRun row and emits run_started.
// heartbeat bumps heartbeatAt + emits a tiny heartbeat event.
// finishRun flips status terminal + emits run_finished.
//
// AgentTaskRun.status is a denormalized projection of the ledger; the
// "what really happened" answer always comes from listRunEvents(runId).
// Status is here for cheap dashboard queries (Phase 3 /runs list).

export interface StartRunOpts {
  /** Required by the AgentTaskRun schema. */
  projectId: string;
  agentId: string;
  triggerKind: string; // "column_move" | "assignment" | "comment" | "manual" | …
  executionMode: string;
  /** Optional — populated when the run is card-driven. */
  cardId?: string | null;
  /** Optional — populated by snapshotHarness in Plan 01-02 when wired. */
  harnessSnapshotId?: string | null;
  /** Existing AgentTaskRun.trigger column (defaults to "card"); pass to override. */
  trigger?: string;
}

export async function startRun(opts: StartRunOpts) {
  const run = await prisma.agentTaskRun.create({
    data: {
      projectId: opts.projectId,
      agentId: opts.agentId,
      cardId: opts.cardId ?? null,
      triggerKind: opts.triggerKind,
      executionMode: opts.executionMode,
      trigger: opts.trigger ?? 'card',
      status: 'running',
      heartbeatAt: new Date(),
      harnessSnapshotId: opts.harnessSnapshotId ?? null,
    },
  });
  await appendRunEvent(run.id, 'run_started', {
    agentId: opts.agentId,
    projectId: opts.projectId,
    cardId: opts.cardId ?? null,
    triggerKind: opts.triggerKind,
    executionMode: opts.executionMode,
    harnessSnapshotId: opts.harnessSnapshotId ?? null,
  });
  return run;
}

export async function heartbeat(runId: string): Promise<void> {
  await prisma.agentTaskRun.update({
    where: { id: runId },
    data: { heartbeatAt: new Date() },
  });
  // Heartbeat events are frequent; payload stays minimal so the ledger
  // doesn't bloat. Phase 2's stuck-run detection (REL-08) reads heartbeatAt
  // directly, not these events — the events are here for trace continuity.
  await appendRunEvent(runId, 'heartbeat', {});
}

export async function finishRun(
  runId: string,
  status: 'succeeded' | 'failed' | 'cancelled',
  summary?: string,
): Promise<void> {
  await prisma.agentTaskRun.update({
    where: { id: runId },
    data: {
      status,
      finishedAt: new Date(),
      heartbeatAt: new Date(),
      summaryMd: summary ?? null,
    },
  });
  await appendRunEvent(runId, 'run_finished', { status, summary: summary ?? null });
}
