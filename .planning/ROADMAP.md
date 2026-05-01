# Roadmap — Memory v1–v4

**Milestone:** Upgrade agent memory from "load-everything-into-prompt" to a relevance-ranked, project-shared, lifecycle-managed system.

## Why this milestone

Today, `compileHarness` (`src/lib/agentHarness.ts:161`) loads **every** `AgentMemory` row for an agent on every run and pastes the whole list into the system prompt under `## Memory`, grouped by `kind`. This is fine at 30 entries, wasteful at 300, and breaks the prompt at 3000+. There's no semantic search, no project-shared knowledge tier, no decay, no dedup, and no audit of what was actually used. This milestone fixes the structural ceiling.

The design borrows the strongest idea from `claude-os` (relevance-ranked retrieval over a vector store) without adopting its weight (Python sidecar, sqlite-vec, separate KB abstraction). We use what's already in the stack: Postgres + pgvector + Prisma 7 + the OpenAI SDK already in dependencies.

## Phases

### Phase 1 — Memory v1: Embedding-ranked retrieval

**Status:** CODE_COMPLETE (live verification with OpenAI key pending — see `.planning/STATE.md` Blockers)
**Why:** Stop dumping all memories into every prompt. Surface only what's relevant to the current run, with safe fallbacks for keyless setups.

**Scope:**
- Add `embedding vector(1536)` column to `AgentMemory` via pgvector migration.
- New `src/lib/embeddings.ts` — thin OpenAI `text-embedding-3-small` wrapper. Returns `null` when `OPENAI_API_KEY` is unset (keyless / CLI-only setups stay non-breaking).
- Embed `content` on every memory write (`POST /api/agents/[id]/memory`, `PUT /api/agents/[id]/memory/[key]`).
- Rewrite `compileHarness` retrieval:
  - Add `triggerText?: string` to `HarnessContext`.
  - When `triggerText` + key present → top-12 cosine-ranked query, plus all `kind='preference'` rows unconditionally, plus any `kind='decision'` updated in last 7 days.
  - When key absent or `triggerText` empty → fall back to current `findMany` (non-breaking).
- `runAgent` defaults `triggerText` from `opts.userPrompt` so existing callers don't need updates.
- Log retrieved `{ key, score }` list to `AgentActivityLog` as `memory_retrieved` event.
- Unit test for the ranking logic with a mocked embedding function.

**Success criteria:**
- [ ] `prisma migrate deploy` succeeds against a clean DB with pgvector available.
- [ ] Memory writes succeed with and without `OPENAI_API_KEY`.
- [ ] When key is set, agent runs that touch a topic surface only relevant memories — verified by reading the compiled system prompt for a test agent with 50+ memories.
- [ ] When key is absent, behavior is byte-identical to today.
- [ ] `AgentActivityLog` shows one `memory_retrieved` row per qualifying run with the keys + scores used.
- [ ] `npm test` passes including the new ranking test.
- [ ] No UI changes; no new tables.

**Tracked:** `.planning/quick/20260501-memory-v1-embedding-rank/`

---

### Phase 2 — Memory v2: Project-tier shared memory

**Status:** CODE_COMPLETE — 8 commits, 81 tests pass, awaiting live verification (UI smoke + vector path with OpenAI key). See `.planning/phases/02-memory-v2-project-tier/02-01-SUMMARY.md`.
**Depends on:** Phase 1

**Why:** Per-agent memory creates silos. A PM agent learns "billing deferred to v2"; the CTO agent doesn't see it. A Developer agent learns "auth code lives in `src/lib/auth/`"; sister Developer agents repeat the discovery. Project-scoped memory lets agents share learnings without admin-edited markdown.

**Scope:**
- New `ProjectMemory` model: `{ id, projectId, key, content, kind, writtenBy?, embedding, createdAt, updatedAt }`. Unique on `(projectId, key)`.
- `kind` taxonomy: `decision | glossary | convention | fact`.
- New tool for agents: `set_project_memory(key, content, kind)` — gated to project membership, written to `AgentActivityLog` as `project_memory_written` with `writtenBy = agentId`.
- `compileHarness` pulls top-K project memories alongside per-agent memories using the same retrieval logic as Phase 1. Project memories appear in a separate prompt section (`## Project Memory`) so the model can distinguish "I learned this" vs "we as a team learned this".
- API endpoints `/api/projects/[id]/memory` (GET/POST) + `/api/projects/[id]/memory/[key]` (GET/PUT/DELETE) — admin-only writes from the UI; agents write via the tool. Reads are project-member-gated.
- Light UI surface in the project Settings tab for browsing + manually editing project memory (no fancy editor; same shape as agent memory list).

**Success criteria:**
- [ ] Two agents in one project, neither having seen each other's history, both surface a `kind='decision'` project memory written by a third agent.
- [ ] Project memory writes show in `AgentActivityLog` with the writing agent traceable.
- [ ] Agent in a different project does NOT see another project's memory (auth boundary verified by test).
- [ ] No regression in Phase 1 behavior (per-agent memory still works the same).

---

### Phase 3 — Memory v3: Lifecycle (dedup + stale flag)

**Status:** PENDING
**Depends on:** Phase 1 (Phase 2 not strictly required, but ideally landed first so dedup runs across both tiers).

**Why:** Memory accumulates. Without lifecycle ops, agents end up with redundant entries (same fact stated three different ways) and stale context (decisions from six months ago still riding in the prompt). claude-os solves this with dedup + archival; we adopt the minimal slice that earns its keep.

**Scope:**
- Scheduled job in `src/lib/scheduler/` — runs nightly per project.
- **Dedup pass:** for each agent + project, find memory pairs with cosine similarity > 0.92 and matching `kind`. Auto-merge: keep the newer `updatedAt`, copy any non-empty `sourceRef` from the older row, drop the older row. Log to `AgentActivityLog` as `memory_deduped` with both keys.
- **Stale pass:** any `kind='context'` memory not retrieved in 90 days (per `memory_retrieved` log) gets `stale: true`. Stale rows are excluded from retrieval and hidden in the harness modal by default; user can show + un-stale or delete.
- New `stale` boolean column on `AgentMemory` (and `ProjectMemory` if Phase 2 has shipped).
- Manual trigger: `/api/agents/[id]/memory/lifecycle` POST — runs both passes on demand. Same for project memory.
- Read-only summary endpoint: counts of `total`, `embedded`, `stale`, `dedup-candidates` per agent.

**Success criteria:**
- [ ] Seed test data with two near-identical memories → after dedup pass, one row remains with both `sourceRef` values preserved (separator-joined).
- [ ] Memory not retrieved in 90+ days → `stale = true` after stale pass, not surfaced in next agent run.
- [ ] Manual trigger endpoint runs without spawning a job; returns counts.
- [ ] Lifecycle counts visible via summary endpoint.

---

### Phase 4 — Memory v4: Retrieval audit UI

**Status:** PENDING
**Depends on:** Phase 1 (Phase 2/3 enrich the UI but aren't required).

**Why:** Trust. If memory is now ranked + filtered, humans need to see what the agent actually used for a given turn — both for debugging ("why did you say that?") and for confidence ("oh, that came from the COOP-42 decision"). The data is already in `AgentActivityLog` from Phase 1; this phase makes it visible.

**Scope:**
- Extend the agent harness modal (`src/components/agents/AgentHarnessModal.tsx`) with a "Retrievals" tab.
- Each retrieval row shows: timestamp, run trigger preview (first 200 chars), retrieved keys + scores, click-through to the source memory.
- Endpoint `/api/agents/[id]/activity?type=memory_retrieved&limit=50` — paginated.
- "Why this memory?" inline tooltip on memory rows in the existing memory list — shows the last 3 turns where that memory was retrieved + the score it got.
- (Stretch) Per-memory retrieval count badge in the memory list, sorted descending — "this memory got pulled into 17 runs in the last 30 days."

**Success criteria:**
- [ ] Open agent harness → Retrievals tab shows recent runs with retrieved memory keys.
- [ ] Click a retrieved key → scrolls/highlights that memory row.
- [ ] Memory list shows retrieval counts.
- [ ] No new tables — purely an audit-log read view.

## Out of scope for this milestone

- **Tree-sitter / AST code indexing** — that's a different feature (agents that know your codebase via static analysis). It belongs alongside `src/lib/coding/`, not in `AgentMemory`.
- **Cross-project memory search** — Co-Op's memory is team-scoped; cross-project search has auth implications and isn't worth the complexity yet.
- **"Natural-language remember this"** — claude-os's pitch for the Claude Code CLI. Co-Op agents already write memory via tools; the user-facing equivalent is the existing memory UI. No chat-side parser.
- **Replacing OpenAI embeddings with a local model** — viable later via `@xenova/transformers`, but adding a second runtime path now is premature. The keyless fallback in Phase 1 already keeps non-OpenAI setups working.

## References

- Inspiration: [`brobertsaz/claude-os`](https://github.com/brobertsaz/claude-os) — adopted the relevance-ranked retrieval pattern; rejected the Python sidecar, SQLite + sqlite-vec, and the broader Knowledge-Base abstraction.
- Current state: `src/lib/agentHarness.ts:161` (`compileHarness`), `prisma/schema.prisma:364` (`AgentMemory`).
