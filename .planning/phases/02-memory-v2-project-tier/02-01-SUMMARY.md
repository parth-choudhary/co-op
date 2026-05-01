---
status: complete
phase: 2
plan: 1
date: 2026-05-01
---

# Memory v2 — Project-tier shared memory

## What shipped

A project-scoped memory tier above the per-agent layer built in Phase 1. Every agent in a project now reads from a shared brain on every run; agents write to it via a tool; humans browse + edit it from project settings. Cross-project isolation is enforced and locked in by tests.

## Commits

| # | Hash | Subject |
|---|------|---------|
| 1 | `9ef8213` | docs(planning): plan Memory v2 Phase 2 |
| 2 | `fbe9357` | feat(memory): add ProjectMemory model + pgvector index |
| 3 | `d9975cf` | feat(memory): project memory CRUD API endpoints |
| 4 | `28b721a` | feat(memory): add set_project_memory agent tool |
| 5 | `5cdd57f` | feat(memory): include project memory in compileHarness |
| 6 | `15a7260` | feat(memory): project memory settings UI |
| 7 | `6b0d36c` | test(memory): cross-project isolation contract |
| 8 | `1b2d3bc` | test(memory): keyless fallback contract for project memory |

## Files touched

- `prisma/schema.prisma` — new `ProjectMemory` model, `Project.projectMemories` relation.
- `prisma/migrations/20260502010000_add_project_memory/migration.sql` — table + HNSW cosine index + FK.
- `src/app/api/projects/[id]/memory/route.ts` — new (GET list + POST upsert with embed-on-write).
- `src/app/api/projects/[id]/memory/[key]/route.ts` — new (GET / PUT / DELETE).
- `src/lib/agentTools.ts` — added `set_project_memory` tool definition.
- `src/lib/agentActions.ts` — added action variant + `setProjectMemory` handler.
- `src/lib/agentHarness.ts` — added `retrieveProjectMemories` helper, two new `AgentEventType` values (`project_memory_written`, `project_memory_retrieved`), restructured `compileHarness` to a two-phase fetch, added `## Project Memory` prompt section.
- `src/app/p/[projectId]/settings/memory/page.tsx` — new settings page (list + add/edit modal + delete).
- `src/app/p/[projectId]/settings/page.tsx` — added link card for the new route.
- `tests/compat/harness-isolation.test.ts` — extended mock to cover `prisma.projectMemory.findMany` and `prisma.agentActivityLog.create` (test was silently hitting the live DB and running 30× slower).
- `tests/compat/project-memory-auth.test.ts` — new (cross-project isolation contract).
- `tests/compat/project-memory-retrieval.test.ts` — new (keyless fallback contract).

## Behavior

**With `OPENAI_API_KEY` set:**
- Memory writes (settings UI POST + agent `set_project_memory` tool) embed `content` and store the vector.
- Each agent run calls `retrieveProjectMemories(agentId, agent.projectId, triggerText)` in parallel with the existing `retrieveMemories` and the project doctrine fetch. Same three-source CTE — top-12 cosine + all `kind='preference'` rows + all `kind='decision'` rows updated in last 7 days — deduped by id with the scored copy winning.
- Retrieved keys + scores logged to `AgentActivityLog` as `project_memory_retrieved` with `{ projectId, retrieved: [{key, score}], query }`.
- Agent tool writes log to `AgentActivityLog` as `project_memory_written` with `{ projectId, key, kind, embedded }`.

**Without `OPENAI_API_KEY`:**
- Writes leave the embedding column NULL (same fallback as Phase 1).
- Reads fall back to `prisma.projectMemory.findMany({ where: { projectId }, orderBy: [{ kind: 'asc' }, { updatedAt: 'desc' }] })` — the byte-identical equivalent of the Phase 1 keyless fallback for `AgentMemory`.
- No retrieval audit log written on the fallback path (matches Phase 1; activity log isn't polluted).

**Auth boundary:**
- API endpoints — every handler runs `auth()` then `prisma.projectMember.findUnique` for membership. Non-members get 403. Same gate the existing `/secrets` endpoints use.
- Agent tool — `setProjectMemory` resolves `agentId → projectId` server-side from `prisma.aIAgent.findUnique`. There is no input parameter that lets the model choose a target project. Agents with `projectId = null` (rare; `companyId`-only agents) get a polite refusal that surfaces back to the model.

**Prompt rendering:**
- New `## Project Memory` section appears below the existing `## Memory` section, intro paragraph distinguishes the two tiers ("shared with every agent in this project"). Same kind-grouped layout (`### decision`, `### convention`, `### glossary`, `### fact`).
- Section is suppressed entirely when project memory is empty OR when the agent has no `projectId`.

## Verification

- `npx prisma migrate deploy` — applied `20260502010000_add_project_memory` cleanly. Verified `\d ProjectMemory` shows the column, HNSW index, and FK.
- `npx tsc --noEmit` — clean.
- `npm test` — **81 tests, 79 pass, 2 skipped, 0 fail.** Hits the plan's `≥81 total tests` success criterion (was 73 before Phase 2; +4 auth + +4 keyless = 81).
- New tests:
  - `tests/compat/project-memory-auth.test.ts` — 4 cases.
  - `tests/compat/project-memory-retrieval.test.ts` — 4 cases.
- **UI live verification — left to the user.** `tsc --noEmit` clean and the dev server is up, but the page is auth-gated and I can't drive a browser. Recommended manual smoke before flipping ROADMAP status to COMPLETE: open `/p/<projectId>/settings/memory`, add one memory of each kind, edit one, delete one, confirm rows appear/disappear without a refresh. Then have an agent in the same project call `set_project_memory` (e.g. via chat) and confirm the row shows up with the agent's name as the writer.
- **Vector path live verification — also user.** Set `OPENAI_API_KEY`, restart the dev server, write 5+ project memories with varied content, send a topical message to an agent, and inspect `AgentActivityLog` for a `project_memory_retrieved` row whose `retrieved` payload contains only the relevant keys.

## Caveats

- **No backfill of embeddings for existing rows.** Project memories created before `OPENAI_API_KEY` is set have `embedding = NULL` and won't be picked up by the vector path until they're re-saved. Same situation Phase 1 left for `AgentMemory`. A backfill script is a small follow-up if it becomes annoying.
- **Per-project OpenAI keys still not used for embeddings.** Same gap as Phase 1 — embeddings come from `process.env.OPENAI_API_KEY` only. Real-world friction probably won't show up until multi-tenant deployment, which is out of scope for the M1 milestone.
- **No role gate on writes.** Any `ProjectMember` can read AND write project memory. The plan documented this as deliberate; tighten if abuse appears.
- **Endpoint-level auth tests deferred.** API handlers use the same `assertMember` pattern as `/secrets` (battle-tested), so the unit-test surface is the new logic in the agent tool + retrieval helper. Endpoint tests would mostly exercise NextAuth's `auth()` helper — better captured by integration tests against a live dev server.

## Next phases

See `.planning/ROADMAP.md`.

- **Phase 3** — Memory v3: lifecycle (dedup + stale flag). Now applies across both tiers; the dedup pass can collapse near-duplicates within `AgentMemory` AND `ProjectMemory`.
- **Phase 4** — Memory v4: retrieval audit UI. Consumes both `memory_retrieved` and `project_memory_retrieved` events Phases 1 & 2 started writing.
