---
status: code-complete
phase: 1
plan: 1
date: 2026-05-04
---

# Plan 01-01 — AgentRunEvent ledger + RunDiff + heartbeat + parallel-write

## What shipped

The keystone substrate for M1: append-only ledger, structured before/after diff capture, run heartbeat helpers, and a parallel-write to AgentActivityLog (CONTEXT D-07) so Memory v1 + card activity views keep working unchanged during M1.

## Commits (7)

| # | Hash | Subject |
|---|------|---------|
| 1 | `ac6eed9` | schema deltas (AgentRunEvent + RunDiff + HarnessSnapshot placeholder + AgentTaskRun additions) |
| 2 | `905af86` | runEvents.ts append-only writer |
| 3 | `44f8172` | tx:any annotation fix |
| 4 | `82960e5` | runDiffs.ts entity snapshot helpers |
| 5 | `c67a222` | runHeartbeat.ts startRun/heartbeat/finishRun |
| 6 | `e579326` | parallel-write to AgentActivityLog (D-07) |
| 7 | `e8fd738` | 9 ledger contract tests |

## Files

- `prisma/migrations/20260504010000_add_run_lifecycle_substrate/migration.sql`
- `prisma/schema.prisma` — AgentRunEvent, RunDiff, HarnessSnapshot (placeholder), AgentTaskRun additions
- `src/lib/runEvents.ts` — appendRunEvent + listRunEvents + projectToLegacyActivityLog
- `src/lib/runDiffs.ts` — snapshotEntity + commitRunDiff
- `src/lib/runHeartbeat.ts` — startRun + heartbeat + finishRun
- `tests/compat/run-lifecycle-ledger.test.ts` — 9 cases

## Requirements

RUN-01 ✅ AgentTaskRun.heartbeatAt + harnessSnapshotId FK
RUN-02 ✅ AgentRunEvent append-only ledger with per-run seq
RUN-05 ✅ RunDiff structured before/after with negative-space (null) deletes

## Verification

- `npx prisma migrate deploy` clean
- `npx tsc --noEmit` clean for `src/`
- `npm test` 94 → 103 (+9), all green
- No callers wire to runEvents yet — Phase 2 (REL-01..03) wraps agentRunner with bounded retries + idempotency + ledger emission together
