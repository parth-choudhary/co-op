-- Memory v3 (Phase 3): lifecycle columns on AgentMemory + ProjectMemory.
--
-- `stale` flags rows that should be excluded from compileHarness retrieval.
-- Currently set by the markStaleAgentMemories pass for kind='context' rows
-- not retrieved in 90 days; manually settable from the harness UI in
-- Phase 4. ProjectMemory inherits the column for symmetry but has no
-- automatic stale-marking yet (no kind='context' in the project tier).
--
-- `lastRetrievedAt` is updated lazily on every retrieval pass that includes
-- a row. Drives the 90-day stale-detection cutoff. NULL on rows that have
-- never been retrieved (or rows from before this migration — those will
-- start tracking as soon as compileHarness next pulls them).

ALTER TABLE "AgentMemory"
  ADD COLUMN "stale" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "lastRetrievedAt" TIMESTAMP(3);

ALTER TABLE "ProjectMemory"
  ADD COLUMN "stale" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "lastRetrievedAt" TIMESTAMP(3);

CREATE INDEX "AgentMemory_agentId_stale_idx" ON "AgentMemory"("agentId", "stale");
CREATE INDEX "ProjectMemory_projectId_stale_idx" ON "ProjectMemory"("projectId", "stale");
