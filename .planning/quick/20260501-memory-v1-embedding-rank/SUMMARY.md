---
status: complete
quick_id: 20260501-memory-v1-embedding-rank
date: 2026-05-01
---

# Memory v1 — Embedding-ranked retrieval

## What shipped

Replaces the load-everything-into-prompt memory layer in `compileHarness` with a relevance-ranked retrieval path. Agent memory now scales to 10²–10⁴ rows per agent without bloating the system prompt — the agent only sees memories relevant to the current run, plus a guaranteed slice of preferences and recent decisions.

## Commits

| # | Hash | Subject |
|---|------|---------|
| 1 | `3869589` | docs(planning): bootstrap GSD with Memory v1-v4 milestone |
| 2 | `7c713de` | feat(memory): add pgvector + embedding column on AgentMemory |
| 3 | `9f1166d` | feat(memory): add OpenAI embeddings wrapper with keyless fallback |
| 4 | `b69435b` | feat(memory): embed AgentMemory.content on POST and PUT |
| 5 | `fd08b0a` | feat(memory): replace findMany with relevance-ranked retrieval in compileHarness |
| 6 | `64066dc` | feat(memory): default compileHarness triggerText from runAgent's userPrompt |
| 7 | `8be8526` | test(memory): lock in keyless-fallback contract for retrieveMemories |

## Files touched

- `prisma/schema.prisma` — added `AgentMemory.embedding Unsupported("vector(1536)")?`.
- `prisma/migrations/20260501010000_add_pgvector_agent_memory/migration.sql` — `CREATE EXTENSION vector` + `ALTER TABLE` + HNSW cosine index.
- `docker-compose.yml` — db service swapped `postgres:16-alpine` → `pgvector/pgvector:pg16`. Same Postgres 16 binary; existing volume is forward-compatible.
- `src/lib/embeddings.ts` — new. OpenAI text-embedding-3-small wrapper. Returns null when keyless.
- `src/app/api/agents/[id]/memory/route.ts` — POST embeds content after upsert.
- `src/app/api/agents/[id]/memory/[key]/route.ts` — PUT embeds when content was sent.
- `src/lib/agentHarness.ts` — added `triggerText` to HarnessContext; new exported `retrieveMemories` helper; logs `memory_retrieved` to AgentActivityLog.
- `src/lib/agentRunner.ts` — defaults `triggerText` from `opts.userPrompt` so existing call sites benefit without changes.
- `tests/compat/agent-memory-retrieval.test.ts` — new. Locks in the keyless-fallback contract.

## Behavior

**With `OPENAI_API_KEY` set:** every memory write embeds content and stores the vector. Every agent run embeds the trigger (chat msg, card title+desc, cron prompt — defaulted from `runAgent`'s `userPrompt`) and pulls:
- top-12 cosine-ranked rows that have an embedding
- ALL `kind='preference'` rows (always in prompt — user-set policy)
- ALL `kind='decision'` rows updated in last 7 days (recency boost)
…deduped by id (scored copy wins). Retrieved `{key, score}` pairs are written to `AgentActivityLog` as a `memory_retrieved` event for the Phase 4 audit UI.

**Without `OPENAI_API_KEY`:** `embedText` returns null. Writes leave the embedding column NULL. Reads fall back to the legacy `prisma.agentMemory.findMany` with the original ordering (kind asc, updatedAt desc) — byte-identical to the pre-Phase-1 behavior. Anthropic-only and CLI-only deployments are unaffected. `memory_retrieved` is NOT written on the fallback path so the activity log isn't polluted.

## Verification

- `npx prisma migrate deploy` — applied migration 20260501010000 cleanly against an upgraded `pgvector/pgvector:pg16` container.
- `npx tsc --noEmit` — clean.
- `npm test` — 73 tests, 71 pass, 2 skipped, 0 fail. New retrieval tests at `tests/compat/agent-memory-retrieval.test.ts` cover the four keyless-fallback branches.
- Live verification against a real OpenAI key + dev server — **left to the user**. To validate: set `OPENAI_API_KEY`, restart the dev server, write 5+ memories with varied content, send the agent a topical message, then inspect `AgentActivityLog` (via the harness modal or `psql`) for a `memory_retrieved` row whose `retrieved` payload contains only the relevant keys.

## Caveats / known gaps

- **No backfill of embeddings for existing memories.** Rows written before this PR have `embedding = NULL` and won't be picked up by the vector path until they're re-saved. A backfill script (or just re-saving from the harness UI) is a small follow-up if it becomes annoying — not a Phase 1 blocker.
- **No score threshold.** The top-12 query returns the 12 closest rows even if their cosine similarity is low. In the limit (one or two memories, neither relevant), the agent will still see them. This is conservative on purpose: the alternative — silent omission below a threshold — would mask retrieval issues during early use. Revisit in Phase 3.
- **Per-project OpenAI keys are not used for embeddings.** Co-Op already encrypts per-project model keys; the embedding wrapper only reads `process.env.OPENAI_API_KEY`. Fine for v1 (single self-hosted instance) but a real gap for multi-tenant deployments. Left as a future enhancement; not urgent.

## Next phases

See `.planning/ROADMAP.md`. Phase 2 (project-tier shared memory) and Phase 3 (lifecycle / dedup / stale) both build directly on this foundation. Phase 4 (retrieval audit UI) consumes the `memory_retrieved` events this phase started writing.
