-- Code automation: per-project config + per-run job rows + Card mirror fields.

CREATE TABLE "ProjectCodeConfig" (
  "projectId"            TEXT NOT NULL,
  "executionMode"        TEXT NOT NULL,
  "mergePolicy"          TEXT NOT NULL DEFAULT 'human_pr',
  "repoFullName"         TEXT,
  "defaultBranch"        TEXT NOT NULL DEFAULT 'main',
  "stagingBranch"        TEXT,
  "ghInstallationId"     TEXT,
  "triggerColumnId"      TEXT,
  "triggerOnAssign"      BOOLEAN NOT NULL DEFAULT false,
  "triggerOnComment"     BOOLEAN NOT NULL DEFAULT true,
  "triggerOnColumnMove"  BOOLEAN NOT NULL DEFAULT true,
  "triggerOnManual"      BOOLEAN NOT NULL DEFAULT true,
  "sshHost"              TEXT,
  "sshUser"              TEXT,
  "sshKeyEncrypted"      TEXT,
  "maxTokensPerRun"      INTEGER NOT NULL DEFAULT 200000,
  "maxWallSecondsPerRun" INTEGER NOT NULL DEFAULT 1800,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectCodeConfig_pkey" PRIMARY KEY ("projectId"),
  CONSTRAINT "ProjectCodeConfig_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "AgentTaskRun" (
  "id"            TEXT NOT NULL,
  "projectId"     TEXT NOT NULL,
  "cardId"        TEXT NOT NULL,
  "agentId"       TEXT NOT NULL,
  "triggerKind"   TEXT NOT NULL,
  "executionMode" TEXT NOT NULL,
  "status"        TEXT NOT NULL DEFAULT 'queued',
  "branchName"    TEXT,
  "prNumber"      INTEGER,
  "prUrl"         TEXT,
  "commitSha"     TEXT,
  "logsUrl"       TEXT,
  "errorMessage"  TEXT,
  "taskBrief"     TEXT,
  "startedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt"    TIMESTAMP(3),
  CONSTRAINT "AgentTaskRun_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AgentTaskRun_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "AgentTaskRun_cardId_idx" ON "AgentTaskRun"("cardId");
CREATE INDEX "AgentTaskRun_agentId_idx" ON "AgentTaskRun"("agentId");
CREATE INDEX "AgentTaskRun_projectId_status_idx" ON "AgentTaskRun"("projectId", "status");

ALTER TABLE "Card"
  ADD COLUMN "activeRunId"  TEXT,
  ADD COLUMN "lastPrUrl"    TEXT,
  ADD COLUMN "lastPrStatus" TEXT;
