-- Per-task scheduled jobs. One row per user-created reminder, recurring, or
-- one-shot schedule. Distinct from AIAgent.scheduleCron (whole-agent heartbeat).

CREATE TABLE "ScheduledJob" (
  "id"           TEXT NOT NULL,
  "projectId"    TEXT NOT NULL,
  "agentId"      TEXT NOT NULL,
  "kind"         TEXT NOT NULL DEFAULT 'reminder', -- reminder | recurring | one_shot
  "cronExpr"     TEXT,
  "runAt"        TIMESTAMP(3),
  "nextRunAt"    TIMESTAMP(3) NOT NULL,
  "prompt"       TEXT NOT NULL,
  "title"        TEXT,
  "sessionKey"   TEXT,
  "cardId"       TEXT,
  "payload"      JSONB,
  "timezone"     TEXT DEFAULT 'UTC',
  "createdById"  TEXT,
  "enabled"      BOOLEAN NOT NULL DEFAULT true,
  "lastRunAt"    TIMESTAMP(3),
  "lastRunId"    TEXT,
  "runCount"     INTEGER NOT NULL DEFAULT 0,
  "expiresAt"    TIMESTAMP(3),
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ScheduledJob_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ScheduledJob_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ScheduledJob_agentId_fkey"
    FOREIGN KEY ("agentId") REFERENCES "AIAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ScheduledJob_projectId_idx" ON "ScheduledJob"("projectId");
CREATE INDEX "ScheduledJob_agentId_idx" ON "ScheduledJob"("agentId");
CREATE INDEX "ScheduledJob_enabled_nextRunAt_idx" ON "ScheduledJob"("enabled", "nextRunAt");
CREATE INDEX "ScheduledJob_cardId_idx" ON "ScheduledJob"("cardId");
