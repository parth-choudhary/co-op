---
status: code-complete
phase: 1
plan: 2
date: 2026-05-05
---

# Plan 01-02 — HarnessSnapshot + buildHarness/snapshotHarness deterministic split

## What shipped

Refactored `compileHarness` into a layered set of pure + impure functions so harness assembly is deterministic on inputs (RUN-03) and run snapshots capture exactly what the model saw at run start (RUN-04). compileHarness preserved as a thin backward-compat wrapper.

## Commits (3)

| # | Hash | Subject |
|---|------|---------|
| 1 | `6b34666` | extend HarnessSnapshot with capture columns (compiledPrompt + toolSchema + pluginAllowlist + runMode + agentStateHash + retrievedMemories + capturedAt) |
| 2 | `8506a92` | split compileHarness → loadHarnessInputs + assemblePrompt + buildHarness + snapshotHarness + thin compileHarness wrapper |
| 3 | `204b2e0` | 7 determinism tests |

(Three commits instead of the planned four — harnessInputs.ts + the compileHarness refactor were combined into one commit since putting them in separate files would have introduced a circular import with `retrieveMemories`. Everything lives inside `agentHarness.ts`; the same pure/impure surfaces are exported.)

## Files

- `prisma/migrations/20260505010000_extend_harness_snapshot/migration.sql`
- `prisma/schema.prisma` — HarnessSnapshot extended
- `src/lib/agentHarness.ts` — HarnessInputs + loadHarnessInputs + assemblePrompt + buildHarness + snapshotHarness + stableStringify; compileHarness becomes a wrapper
- `tests/compat/harness-determinism.test.ts` — 7 cases

## Requirements

RUN-03 ✅ Same inputs ⇒ identical assemblePrompt output (clock-leakage guard test passes)
RUN-04 ✅ snapshotHarness writes the full HarnessSnapshot row with state hashes + retrievedMemories

## Verification

- `npx prisma migrate deploy` clean
- `npx tsc --noEmit` clean for `src/`
- `npm test` 113 → 120 (+7), all green
- Existing harness-isolation, agent-memory-retrieval, project-memory-retrieval tests untouched — compileHarness wrapper produces byte-equivalent output to pre-refactor

## Caveats

- `toolSchema` is `[]` in Phase 1: runtime tool list is computed by agentRunner.ts. Phase 2 will pass the resolved schema into snapshotHarness via an options parameter so the captured snapshot reflects exactly what the model received.
- `runMode` defaults to `'propose-and-execute'` for all agents. Phase 2's REL-06 adds `AIAgent.runMode` column and threads it through.
- snapshotHarness is shipped but not yet called by runAgent. Phase 2 wires it so AgentTaskRun.harnessSnapshotId gets populated at run start.
