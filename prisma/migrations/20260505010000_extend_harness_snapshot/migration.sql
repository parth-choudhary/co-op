-- M1 Phase 1 / Plan 01-02.1 — extend HarnessSnapshot beyond the 01-01 placeholder.
-- Captures the exact inputs that produced a run start: compiled prompt, tool
-- schema, plugin allowlist, run-mode flag, agent + project state hashes, and
-- the retrieved-memory set (both tiers). The placeholder created in
-- 20260504010000 had no rows, so the NOT NULL DEFAULT pattern is belt-and-
-- suspenders — defaults are dropped after the columns exist so future inserts
-- must populate them explicitly.

ALTER TABLE "HarnessSnapshot"
  ADD COLUMN "agentId" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "compiledPrompt" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "toolSchema" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN "pluginAllowlist" TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN "runMode" TEXT NOT NULL DEFAULT 'propose-and-execute',
  ADD COLUMN "agentStateHash" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "projectStateHash" TEXT,
  ADD COLUMN "retrievedMemories" JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "HarnessSnapshot"
  ALTER COLUMN "agentId" DROP DEFAULT,
  ALTER COLUMN "compiledPrompt" DROP DEFAULT,
  ALTER COLUMN "toolSchema" DROP DEFAULT,
  ALTER COLUMN "pluginAllowlist" DROP DEFAULT,
  ALTER COLUMN "runMode" DROP DEFAULT,
  ALTER COLUMN "agentStateHash" DROP DEFAULT,
  ALTER COLUMN "retrievedMemories" DROP DEFAULT,
  ALTER COLUMN "capturedAt" DROP DEFAULT;

CREATE INDEX "HarnessSnapshot_agentId_createdAt_idx" ON "HarnessSnapshot"("agentId", "createdAt");
