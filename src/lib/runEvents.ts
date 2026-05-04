import prisma from './db';

// M1 Phase 1 / Plan 01-01.2 — append-only ledger writer.
//
// Discriminated event-type registry. Phase 1 ships the core taxonomy; later
// phases extend with retry / cap_exceeded / mode_violation (P2),
// out_of_plan_tool_call / amendment_cap_exceeded (P4). The string union is
// open at the type level so new kinds can be appended without churning every
// caller; the runtime registry below is the documented surface.

export const RUN_EVENT_TYPES = [
  'run_started',
  'run_finished',
  'tool_call_started',
  'tool_call_succeeded',
  'tool_call_failed',
  'llm_message_in',
  'llm_message_out',
  'side_effect',
  'heartbeat',
] as const;

export type RunEventType = (typeof RUN_EVENT_TYPES)[number];

export interface RunEventListOptions {
  limit?: number;
  afterSeq?: bigint;
  types?: string[];
}

/**
 * Append a single event to the ledger for a run. Atomic: the (runId, seq)
 * unique constraint means concurrent appends serialize via the transaction.
 *
 * `seq` is allocated as MAX(seq)+1 inside the transaction. Two concurrent
 * appends both reading MAX(seq)=N can both insert seq=N+1; the second
 * insert fails on the unique constraint. Caller retries — the tool-dispatch
 * wrapper in Phase 2 (REL-01) handles this with bounded backoff.
 */
export async function appendRunEvent(
  runId: string,
  eventType: RunEventType | string,
  payload: unknown,
): Promise<void> {
  await prisma.$transaction(async (tx: any) => {
    const max = await tx.agentRunEvent.aggregate({
      where: { runId },
      _max: { seq: true },
    });
    const nextSeq = (max._max.seq ?? BigInt(0)) + BigInt(1);
    await tx.agentRunEvent.create({
      data: { runId, seq: nextSeq, eventType, payload: payload as any },
    });
  });
}

/**
 * Read events for a run in seq order. Paginated by `afterSeq` (cursor on the
 * unique sequence number, not on createdAt — guaranteed monotone).
 */
export async function listRunEvents(runId: string, opts: RunEventListOptions = {}) {
  return prisma.agentRunEvent.findMany({
    where: {
      runId,
      ...(opts.afterSeq != null ? { seq: { gt: opts.afterSeq } } : {}),
      ...(opts.types && opts.types.length ? { eventType: { in: opts.types } } : {}),
    },
    orderBy: { seq: 'asc' },
    take: opts.limit ?? 200,
  });
}
