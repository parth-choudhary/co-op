# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-05-01)

**Core value:** Shared workspace fabric — humans and agents work in the same UI surfaces (boards, cards, chat).
**Current focus:** Milestone 1 (Trust Foundation) → Phase 1: Run-lifecycle substrate + mobile primitives.

## Current Position

- Milestone: M1 — Trust foundation for "co-op runs co-op"
- Phase: 1 of 6 (Run-lifecycle substrate + mobile primitives) — **PARTIALLY EXECUTED, 21 commits across two sessions**
- Plan: 3 of 4 plans CODE_COMPLETE; 1 of 4 PENDING (01-02 harness determinism)
- Status: Mid-execution. Stopped 2026-05-05 after Plan 01-04 CODE_COMPLETE — see "Session Continuity" below for resume instructions.
- Last activity: 2026-05-05 — Plan 01-04 closed: CardDetailModal adopts BottomSheet at <768px, BottomTabBar (Plans/Runs/Chat) ships in project shell, mobile-primitives contract test added (+6). Test count 107 → 113. Plan 01-02 (harness determinism) still NOT started.
- Resume file: `.planning/phases/01-run-lifecycle-substrate-mobile-primitives/01-02-PLAN.md` (next task: 01-02.1 HarnessSnapshot schema extension + migration)

Progress: [░░░░░░░░░░] 0% (0 / 22 plans across all M1 phases)

## Performance Metrics

**Velocity:**
- Total M1 plans completed: 0
- Average duration: —
- Total M1 execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 | 4 / 4 ✅ | 24 commits / 3 sessions | ~6 commits/plan |
| 2 | 0 / 4 | — | — |
| 3 | 0 / 5 | — | — |
| 4 | 0 / 4 | — | — |
| 5 | 0 / 3 | — | — |
| 6 | 0 / 2 | — | — |

**Recent Trend:** —

*Updated after each plan completion.*

## Accumulated Context

### Decisions

Decisions are logged in `PROJECT.md` Key Decisions table. Roadmap-level decisions resolved 2026-05-01:

- CONCERNS.md fixes interleaved into Phase 2 (plan 02-04), no separate sub-phase.
- PWA manifest ships P1 (MOB-12), push pipeline P5 (MOB-13).
- Run-mode flag is per-agent for M1; per-project deferred to v2.
- Langfuse opt-in via env; commented-out self-host stanza in `docker-compose.yml` from P1.
- P6 composition example = Code Reviewer (M2P-02).

### Pending Todos

None yet (M1 just initialized).

### Blockers/Concerns

- **Live verification of pre-M1 Memory v1.** With `OPENAI_API_KEY` set, restart the dev server, write 5+ memories with varied content for one agent, send a topical message, and confirm `AgentActivityLog` records a `memory_retrieved` row whose `retrieved` payload contains only the relevant keys. This is unrelated to M1 plan execution but should be cleared before Phase 3 (audit) begins, since AUD-02's timeline reads from the same activity log.

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Memory | Memory v3 (lifecycle / dedup) — pre-M1 milestone residual | Deferred (post-M1 or as inserted decimal phase if needed) | 2026-05-01 |
| Memory | Memory v4 (retrieval audit UI) — overlaps with M1 P3 audit surfaces | Deferred (revisit during P3 planning if integration is desirable) | 2026-05-01 |

## Prior Work (Pre-M1)

| Phase | Title | Date | Final commit | Status | Directory |
|-------|-------|------|--------------|--------|-----------|
| Memory v1 | Embedding-ranked retrieval (pgvector + OpenAI embeddings + keyless fallback + audit log) | 2026-05-01 | `8be8526` | Code-complete (live verification pending) | `quick/20260501-memory-v1-embedding-rank/` |
| Memory v2 | Project-tier shared memory | 2026-05-01 | `1b2d3bc` | Code-complete (live UI + vector verification pending) | `phases/02-memory-v2-project-tier/` |
| Memory v3 | Lifecycle (dedup + stale flag + summary) — executed despite M1 ROADMAP deferral | 2026-05-02 | `f6f9391` | Code-complete | `phases/03-memory-v3-lifecycle/` |
| Memory v4 | Retrieval audit UI (Retrievals tab + memory-row badges + activity endpoint filter) — executed despite M1 ROADMAP deferral; data model reusable for M1 P3 | 2026-05-02 | `c4e9580` | Code-complete | `phases/04-memory-v4-audit-ui/` |

## Session Continuity

**Last session: 2026-05-05** — Plan 01-04 CODE_COMPLETE; stopped at 67% context before starting Plan 01-02.

### Shipped across two sessions (21 commits)

Plan 01-01 — AgentRunEvent ledger + RunDiff + heartbeat + parallel-write (CODE_COMPLETE):
- `ac6eed9` schema deltas (AgentRunEvent + RunDiff + HarnessSnapshot placeholder + AgentTaskRun additions)
- `905af86` runEvents.ts append-only writer
- `44f8172` $transaction tx:any annotation fix
- `82960e5` runDiffs.ts entity snapshot helpers
- `c67a222` runHeartbeat.ts startRun/heartbeat/finishRun
- `e579326` parallel-write to AgentActivityLog (D-07)
- `e8fd738` 9 ledger contract tests (test count 94 → 103)

Plan 01-03 — instrumentation + Langfuse (CODE_COMPLETE):
- `58b8295` deps + instrumentation.ts entry point
- `6a6888a` Langfuse singleton + traceGeneration
- `f12f9c0` wrap Anthropic / OpenAI / CLI calls
- `4010993` docker-compose Langfuse stanza commented
- `98ee475` 4 env-gating tests (test count 103 → 107)

Plan 01-04 — mobile primitives (CODE_COMPLETE):
- `b01ab99` viewport meta + manifest + placeholder PNG icons (192/512/180)
- `35a6ad2` vaul ^1.1.2 dep
- `5397eb9` tokens.css breakpoint + safe-area + touch-target
- `f8133c8` useViewportLte + Drawer + BottomSheet + MobileNav components
- `5909566` Sidebar collapses into Drawer at <768px (MOB-03)
- `c643d83` CardDetailModal renders as BottomSheet at <768px (MOB-04)
- `2b6aca2` BottomTabBar — Plans/Runs/Chat tabs (D-03/D-04)
- `fac3aad` 6 mobile-primitives contract tests (test count 107 → 113)

### Pending — resume here

**Plan 01-02** (harness determinism — NOT started, ~4 commits, +5 tests):
- 01-02.1 HarnessSnapshot schema extension. Add columns to the placeholder table: compiledPrompt (TEXT), toolSchema (JSONB), pluginAllowlist (TEXT[]), runMode (TEXT default 'propose-and-execute'), agentStateHash (TEXT), projectStateHash (TEXT?), retrievedMemories (JSONB), capturedAt (TIMESTAMP). New migration 20260505*_extend_harness_snapshot. Add @@index([agentId, createdAt]).
- 01-02.2 New file src/lib/harnessInputs.ts. Pure data loader: loadHarnessInputs(agentId, ctx, now) returns the full HarnessInputs object — agent fields, project doctrine, agentMemories, projectMemories, recentActivity, kanban, ctx, now. This is the impure boundary; everything below is testable as pure JS.
- 01-02.3 Refactor src/lib/agentHarness.ts:compileHarness. Extract the prompt-assembly body into pure buildHarness(inputs: HarnessInputs) returning { compiledPrompt, toolSchema, pluginAllowlist, runMode }. New snapshotHarness(agentId, ctx, now) calls loadHarnessInputs → buildHarness → writes a HarnessSnapshot row, returns id. Keep compileHarness as a thin backward-compat wrapper so existing callers (agentRunner.ts:136, agents/[id]/context/route.ts) don't change.
- 01-02.4 tests/compat/harness-determinism.test.ts. 5 cases: identical inputs → identical output (twice); different now doesn't change output (no time-of-day in prompt); memory list reordering → identical output (sort is stable); different agent.systemPrompt → divergent at the systemPrompt section; ProjectMemories empty vs populated → presence/absence of "## Project Memory" block.

**Then Phase 1 closing** (~1-2 commits):
- 4 SUMMARY.md files at .planning/phases/01-run-lifecycle-substrate-mobile-primitives/{01-01,01-02,01-03,01-04}-SUMMARY.md mirroring the format used in memory v1-v4 SUMMARYs
- STATE.md "Status" → COMPLETE; mark Phase 1 [x] in ROADMAP.md
- Test count target after Phase 1 closes: 118 (113 now + 5 from 01-02.4)

### Carryover notes

- `tsc --noEmit` is clean for src/ but reports a pre-existing `scripts/capture-screenshots.ts` error (`@playwright/test` was a transitive dep that got pruned during the langfuse install). Not caused by this work; orthogonal to Phase 1.
- `.env~` template additions (LANGFUSE_PUBLIC_KEY etc., OTEL_EXPORTER_OTLP_ENDPOINT, OPENAI_API_KEY) were written to disk but the file is gitignored (.env* pattern). Local-only.
- Phase 1 currently shows 21 commits in (push'd to origin/main through `fac3aad`). Test count 113. Target after 01-02 closes: 118.
- The execution chain is hand-written rather than running through the heavyweight `/gsd-execute-phase` chain because the published `@gsd-build/sdk@0.1.0` doesn't ship the `gsd-sdk query` interface the workflow expects. Manual execution preserves the same atomic-commit + test-first discipline.

Resume file: `.planning/phases/01-run-lifecycle-substrate-mobile-primitives/01-02-PLAN.md` (start at Task 01-02.1 HarnessSnapshot schema extension).
