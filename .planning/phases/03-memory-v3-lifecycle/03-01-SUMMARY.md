---
status: code-complete
phase: 3
plan: 1
date: 2026-05-02
note: Executed despite M1 ROADMAP deferral — see PLAN.md note.
---

# Memory v3 — Lifecycle (dedup + stale flag)

## What shipped

Maintenance layer for agent + project memory. Three operations, manually triggered:
- **Dedup** collapses cosine-similar memory pairs (threshold 0.92, kind-matched), greedily, keeping the newer row and merging `sourceRef` values.
- **Stale-marking** flags `AgentMemory.kind='context'` rows idle for 90+ days; stale rows are excluded from `compileHarness` retrieval on every code path.
- **Summary** endpoints expose counts (total / embedded / stale / dedupCandidates) for the upcoming audit UI.

## Commits

| # | Hash | Subject |
|---|------|---------|
| 1 | `bc9d8f6` | feat(memory): add stale + lastRetrievedAt columns to both memory tables |
| 2 | `c9bed5a` | feat(memory): lifecycle module — dedup + stale + summary |
| 3 | `73b89f0` | feat(memory): exclude stale rows from retrieval, bump lastRetrievedAt |
| 4 | `883013d` | feat(memory): manual lifecycle trigger endpoints |
| 5 | `516beea` | feat(memory): summary endpoints |
| 6 | `f6f9391` | test(memory): lifecycle module — dedup, stale, summary contracts |

## Files touched

- `prisma/schema.prisma` — `AgentMemory.stale`, `AgentMemory.lastRetrievedAt`, `ProjectMemory.stale`, `ProjectMemory.lastRetrievedAt`. `@@index([agentId|projectId, stale])` on both.
- `prisma/migrations/20260503010000_add_memory_lifecycle_columns/migration.sql` — new.
- `src/lib/memoryLifecycle.ts` — new (241 lines). Five exports + two constants.
- `src/lib/agentHarness.ts` — added `bumpLastRetrievedAtAgent` / `bumpLastRetrievedAtProject` helpers, extended both retrieval functions with `stale = false` filters and the post-retrieval lastRetrievedAt bump. AgentEventType union extended with `memory_lifecycle_run`.
- `src/app/api/agents/[id]/memory/lifecycle/route.ts` — new (POST).
- `src/app/api/projects/[id]/memory/lifecycle/route.ts` — new (POST).
- `src/app/api/agents/[id]/memory/summary/route.ts` — new (GET).
- `src/app/api/projects/[id]/memory/summary/route.ts` — new (GET).
- `tests/compat/memory-lifecycle.test.ts` — new (6 cases).
- `tests/compat/agent-memory-retrieval.test.ts`, `tests/compat/project-memory-retrieval.test.ts`, `tests/compat/harness-isolation.test.ts`, `tests/compat/project-memory-auth.test.ts` — extended mocks with `updateMany` for the new lastRetrievedAt bump.

## Behavior

- **Stale exclusion is universal.** Every retrieval path — fallback `findMany`, ranked CTE, prefs CTE, recent_decisions CTE, on both tiers — filters `stale = false`. A row marked stale (by `markStaleAgentMemories` or by a future manual toggle in Phase 4) drops out of the prompt immediately, regardless of kind, score, or recency.
- **`lastRetrievedAt` bumps lazily.** After every retrieval pass that returns rows, a single batched `updateMany` sets `lastRetrievedAt = NOW()` on the retrieved ids. Runs in parallel with the activity log write on the vector path. Cost: one round-trip per retrieval. For an agent with 1000 rows, worst case ~50ms.
- **Dedup is greedy + idempotent.** Pairs ordered by similarity desc; once a row is dropped, downstream pairs involving it are skipped via in-memory set. Running dedup twice in a row produces no second-pass merges.
- **Stale-marking respects the never-retrieved case.** A brand-new memory with `lastRetrievedAt = null` is only marked stale if its `createdAt` is past the 90-day cutoff — otherwise newly-added rows would be marked stale before they had a chance to be picked up. The where clause uses `OR` to cover this.
- **Audit log emits `memory_lifecycle_run`** as a single event per agent endpoint call (not per pair) so the activity log doesn't flood. Project endpoint emits no event (no agent context).

## Verification

- `npx prisma migrate deploy` — applied `20260503010000_add_memory_lifecycle_columns` cleanly. Verified `\d AgentMemory` shows `stale`, `lastRetrievedAt`, and the index.
- `npx tsc --noEmit` — clean.
- `npm test` — **87 tests, 85 pass, 2 skipped, 0 fail.** Was 81 before Phase 3; +6 lifecycle. New file at `tests/compat/memory-lifecycle.test.ts`.
- **Live verification — left to the user.** Recommended manual smoke: write 5+ memories with intentional duplicates (e.g. "auth code is in src/lib/auth/" twice with slightly different wording), confirm dedup endpoint collapses them. Set `OPENAI_API_KEY` first or the embeddings won't exist for the cosine join to work.

## Caveats

- **No scheduled auto-tick.** Manual trigger only. Wiring into `src/lib/scheduler/tick.ts` is deferred — admins can curl the lifecycle endpoint daily via system cron if they want automation today. The unanchored "should we automate this?" decision waits until memory volume justifies it.
- **No project-tier stale-marking.** `ProjectMemory.stale` exists for the manual harness toggle in Phase 4 but no automatic pass. The project tier has no `kind='context'` (only decision/glossary/convention/fact, which don't decay on a 90d cadence).
- **No score threshold on retrieval.** Stale rows are filtered, but very-low-similarity rows in the top-12 still come through. Low-similarity filtering was deferred from Phase 1 and stays deferred here.
- **Dedup of agent-vs-project rows is NOT done.** A near-duplicate across tiers (someone wrote it as agent memory; someone else wrote essentially the same thing as project memory) survives both passes. Cross-tier dedup would change the model — left for later.

## Next phase

Phase 4 — retrieval audit UI. Per the M1 ROADMAP, this overlaps with M1 Phase 3 audit surfaces; expect rework when M1 Phase 3 lands. The data model (events `memory_retrieved` / `project_memory_retrieved` / `memory_lifecycle_run`, summary endpoints) is reusable across whichever UI absorbs it.
