---
status: code-complete
phase: 4
plan: 1
date: 2026-05-02
note: Executed despite M1 ROADMAP deferral — see PLAN.md note.
---

# Memory v4 — Retrieval audit UI

## What shipped

Two surfaces inside the agent harness modal that turn the `memory_retrieved` and `project_memory_retrieved` events Phases 1 + 2 started writing into visible audit information:

1. **Retrievals tab** — paginated timeline of memory pulls, per agent.
2. **Memory list audit badges** — "pulled into N runs / 30d" chips on each memory row, with hover-tooltip showing the last 3 retrievals.

Plus a small extension to the activity endpoint (`?type=` filter + `?before=` cursor) that powers both surfaces.

## Commits

| # | Hash | Subject |
|---|------|---------|
| 1 | `3042be9` | feat(memory): activity endpoint — type filter + before cursor |
| 2 | `da6d19d` | fix(test): use BigInt() instead of literal `42n` in lifecycle test |
| 3 | `66d186d` | feat(memory): retrievals tab + retrieval count badges in agent harness |
| 4 | `c4e9580` | test(memory): retrieval-audit aggregation contract |

## Files touched

- `src/app/api/agents/[id]/activity/route.ts` — added `?type=memory_retrieved` (and comma-separated multi-type) + `?before=<ISO>` cursor params. Existing callers (no params) get the same response.
- `src/components/agents/AgentHarnessModal.tsx` — new `'retrievals'` Tab + `RetrievalsPanel` component. `MemoryPanel` extended with a per-key retrieval-count badge (using the new `aggregateRetrievalsByKey` helper) and a hover-tooltip for last-3 timestamps + scores.
- `src/lib/retrievalAudit.ts` — new pure aggregation module. Extracted from the modal so it's testable without React.
- `tests/compat/retrieval-audit.test.ts` — new (7 cases).
- `tests/compat/memory-lifecycle.test.ts` — fixed BigInt literal → `BigInt(...)` constructor for ES2017 target compatibility (caught by `tsc` after the activity endpoint commit).

## Behavior

**Retrievals tab:**
- Fetches `/api/agents/[id]/activity?type=memory_retrieved,project_memory_retrieved&limit=50` on open.
- Each row shows: timestamp · tier badge (agent green / project indigo) · retrieved-key count · trigger query (mono-formatted, code-styled background) · per-key chips with cosine score (`0.87`) or "always-include" tooltip for null-score rows (preferences / recent decisions).
- "Load older" button at the bottom uses cursor pagination (`?before=` param) to fetch the next 50 events.

**Memory list audit:**
- On `MemoryPanel` load, fetches the last 100 `memory_retrieved` events alongside the agent's memory list.
- `aggregateRetrievalsByKey` walks the events and builds a per-key map with `{ count, recent[] }` (window: 30 days, max 3 recents).
- Each memory row with `count > 0` shows a badge: `<History icon> N pull(s) / 30d`. Hover surfaces the last 3 retrieval timestamps + scores via the native `title` attribute.
- Memories never retrieved in the window get no badge (no visual noise).

**Activity endpoint:**
- `?type=memory_retrieved` filters to that single event type.
- `?type=memory_retrieved,project_memory_retrieved` filters to either.
- `?before=<ISO>` returns rows strictly older than the cursor (cursor pagination — pass the last row's `createdAt` to fetch the next page).
- All params are additive; existing callers without params get the legacy unfiltered response.

## Verification

- `npx tsc --noEmit` — clean.
- `npm test` — **94 tests, 92 pass, 2 skipped, 0 fail.** Was 87 before Phase 4; +7 retrieval audit.
- New tests at `tests/compat/retrieval-audit.test.ts` cover: per-key counts, window enforcement, recent[] bounded retention, null-score preservation, malformed-payload tolerance, empty input, configurable window/recentPerKey.
- **Live UI smoke — left to the user.** TS clean and the dev server is up but the harness is auth-gated. Recommended manual smoke: open an agent's harness modal → Retrievals tab; confirm timeline renders if there's at least one `memory_retrieved` event in the activity log. Switch to MEMORY.md tab; confirm pulled memories show count badges with hover tooltips.

## Caveats

- **Endpoint route tests deferred.** Testing route handlers requires mocking NextAuth's `auth()` helper, which the rest of the test suite deliberately avoids. The where-builder logic in the route is straightforward enough that extracting it for unit testing would add ceremony without much value. Integration testing against the live dev server is the right next step.
- **Live browser verification skipped.** No headless browser available; the harness modal is auth-gated. tsc clean covers compile-time / module resolution / type shape correctness.
- **No "click a key → jump to source memory" navigation yet.** The retrievals view shows keys as chips but they're not clickable. Could be added cheaply (scroll the Memory tab to the matching row); deferred to keep this phase tight.
- **Retrieval count window is 30 days only.** Configurable in the helper, hardcoded in the UI. If "all-time pulls" or "7-day trend" becomes valuable, the helper already supports it; just expose a control in the UI.

## Memory v1–v4 milestone close

This is the final phase of the Memory v1–v4 milestone (the work that originated from the claude-os MCP-pattern conversation). All four phases CODE_COMPLETE; live verification (UI smoke + OpenAI-keyed retrieval flows) remains the user's call.

**Total contribution across the milestone:**
- 4 phases / 30 commits
- 1 new Prisma model (ProjectMemory) + 3 migrations
- ~10 new endpoints
- 4 new pure modules (`embeddings`, `memoryLifecycle`, `retrievalAudit`, two compileHarness helpers)
- 1 new agent tool (`set_project_memory`)
- 2 new harness UI surfaces (Retrievals tab, audit badges) + 1 new settings page (Project memory)
- 4 new test files (`agent-memory-retrieval`, `project-memory-retrieval`, `project-memory-auth`, `memory-lifecycle`, `retrieval-audit`) — 21 new test cases (73 → 94 total)

Per the M1 ROADMAP, Memory v3 + v4 sit outside M1 scope. The audit data model (events + endpoint shape + aggregation helper) is reusable when M1 Phase 3 (`/runs` audit surfaces) lands.
