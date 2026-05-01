-- Memory v2 (Phase 2): project-scoped shared memory tier.
-- Sibling of AgentMemory but scoped by projectId — every agent in the project
-- reads from this tier on every run alongside its own AgentMemory.
--
-- Hand-written rather than `prisma migrate dev`-generated because Prisma 7
-- can't reliably introspect Unsupported("vector(1536)") for new tables —
-- writing the column + HNSW index together keeps the migration atomic.
-- Requires the `vector` extension; that's enabled by migration
-- 20260501010000_add_pgvector_agent_memory.

CREATE TABLE "ProjectMemory" (
  "id"        TEXT          NOT NULL,
  "projectId" TEXT          NOT NULL,
  "key"       TEXT          NOT NULL,
  "content"   TEXT          NOT NULL,
  "kind"      TEXT          NOT NULL DEFAULT 'fact',
  "source"    TEXT          NOT NULL DEFAULT 'manual',
  "sourceRef" TEXT,
  "writtenBy" TEXT,
  "embedding" vector(1536),
  "createdAt" TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3)  NOT NULL,
  CONSTRAINT "ProjectMemory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectMemory_projectId_key_key" ON "ProjectMemory"("projectId", "key");
CREATE INDEX "ProjectMemory_projectId_idx" ON "ProjectMemory"("projectId");
CREATE INDEX "ProjectMemory_projectId_kind_idx" ON "ProjectMemory"("projectId", "kind");
CREATE INDEX "ProjectMemory_embedding_hnsw_cosine_idx"
  ON "ProjectMemory"
  USING hnsw ("embedding" vector_cosine_ops);

ALTER TABLE "ProjectMemory"
  ADD CONSTRAINT "ProjectMemory_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
