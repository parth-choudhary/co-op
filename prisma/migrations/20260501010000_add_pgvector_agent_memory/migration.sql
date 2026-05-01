-- Memory v1 (Phase 1): relevance-ranked retrieval for AgentMemory.
-- Adds the pgvector extension and an `embedding` column on AgentMemory so
-- compileHarness can pull only the memories relevant to the current run
-- instead of dumping the whole list into every system prompt.
--
-- Requires the Postgres image to ship the `vector` extension. We switched
-- docker-compose's `db` service from `postgres:16-alpine` to
-- `pgvector/pgvector:pg16` in the same commit; deploying against a stock
-- Postgres image will fail at CREATE EXTENSION until that change is rolled.

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "AgentMemory"
  ADD COLUMN "embedding" vector(1536);

-- HNSW index for cosine similarity search. Built lazily as rows are inserted;
-- empty-table creation is fine. m/ef_construction left at pgvector defaults
-- (16/64) — tuned for the 10²–10⁴ vectors-per-agent range we expect.
CREATE INDEX "AgentMemory_embedding_hnsw_cosine_idx"
  ON "AgentMemory"
  USING hnsw ("embedding" vector_cosine_ops);
