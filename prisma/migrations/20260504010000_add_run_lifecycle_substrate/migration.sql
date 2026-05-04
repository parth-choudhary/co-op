-- M1 Phase 1 / Plan 01-01: run-lifecycle substrate.
-- Ships the keystone tables every later phase reads from:
--   AgentRunEvent — append-only ledger
--   RunDiff — structured before/after per entity
--   HarnessSnapshot — placeholder shape; Plan 01-02 extends with compiledPrompt etc.
-- Plus three new nullable columns on the existing AgentTaskRun:
--   heartbeatAt, harnessSnapshotId, summaryMd

ALTER TABLE "AgentTaskRun"
  ADD COLUMN "heartbeatAt" TIMESTAMP(3),
  ADD COLUMN "harnessSnapshotId" TEXT,
  ADD COLUMN "summaryMd" TEXT;

CREATE TABLE "HarnessSnapshot" (
  "id"        TEXT          NOT NULL,
  "runId"     TEXT,
  "createdAt" TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HarnessSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentRunEvent" (
  "id"        TEXT         NOT NULL,
  "runId"     TEXT         NOT NULL,
  "seq"       BIGINT       NOT NULL,
  "eventType" TEXT         NOT NULL,
  "payload"   JSONB        NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgentRunEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AgentRunEvent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentTaskRun"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "AgentRunEvent_runId_seq_key" ON "AgentRunEvent"("runId", "seq");
CREATE INDEX "AgentRunEvent_runId_createdAt_idx" ON "AgentRunEvent"("runId", "createdAt");
CREATE INDEX "AgentRunEvent_eventType_createdAt_idx" ON "AgentRunEvent"("eventType", "createdAt");

CREATE TABLE "RunDiff" (
  "id"        TEXT         NOT NULL,
  "runId"     TEXT         NOT NULL,
  "entity"    TEXT         NOT NULL,
  "entityId"  TEXT         NOT NULL,
  "before"    JSONB,
  "after"     JSONB,
  "inverseOp" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RunDiff_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RunDiff_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentTaskRun"("id") ON DELETE CASCADE
);
CREATE INDEX "RunDiff_runId_idx" ON "RunDiff"("runId");
CREATE INDEX "RunDiff_entity_entityId_idx" ON "RunDiff"("entity", "entityId");

ALTER TABLE "AgentTaskRun"
  ADD CONSTRAINT "AgentTaskRun_harnessSnapshotId_fkey"
  FOREIGN KEY ("harnessSnapshotId") REFERENCES "HarnessSnapshot"("id") ON DELETE SET NULL;
