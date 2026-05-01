-- Skills, plugins, sandbox, secrets, perpetual agents.
-- Adopts OpenClaw's SKILL.md format and plugin contract into the co-op harness.

-- 1. AIAgent extensions ---------------------------------------------------
ALTER TABLE "AIAgent"
  ADD COLUMN "skills"       TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "plugins"      TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "perpetual"    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "scheduleCron" TEXT;

-- 2. AgentTaskRun extensions ---------------------------------------------
ALTER TABLE "AgentTaskRun"
  ADD COLUMN "trigger"        TEXT NOT NULL DEFAULT 'card',
  ADD COLUMN "parentRunId"    TEXT,
  ADD COLUMN "subscriptionId" TEXT,
  ALTER COLUMN "cardId" DROP NOT NULL;

CREATE INDEX "AgentTaskRun_parentRunId_idx" ON "AgentTaskRun"("parentRunId");
CREATE INDEX "AgentTaskRun_subscriptionId_idx" ON "AgentTaskRun"("subscriptionId");

-- 3. ProjectSandboxConfig -------------------------------------------------
CREATE TABLE "ProjectSandboxConfig" (
  "projectId"      TEXT NOT NULL,
  "backend"        TEXT NOT NULL DEFAULT 'local',
  "image"          TEXT NOT NULL DEFAULT 'coop/sandbox-tier1:latest',
  "sshHost"        TEXT,
  "sshUser"        TEXT,
  "sshKeyEncrypted" TEXT,
  "workspaceDir"   TEXT NOT NULL DEFAULT '/workspace',
  "policyYaml"     TEXT,
  "idleTimeoutSec" INTEGER NOT NULL DEFAULT 900,
  "maxWallSeconds" INTEGER NOT NULL DEFAULT 300,
  "enabled"        BOOLEAN NOT NULL DEFAULT true,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectSandboxConfig_pkey" PRIMARY KEY ("projectId"),
  CONSTRAINT "ProjectSandboxConfig_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 4. ProjectSecret --------------------------------------------------------
CREATE TABLE "ProjectSecret" (
  "id"             TEXT NOT NULL,
  "projectId"      TEXT NOT NULL,
  "key"            TEXT NOT NULL,
  "valueEncrypted" TEXT NOT NULL,
  "mountAs"        TEXT NOT NULL DEFAULT 'env',
  "mountPath"      TEXT,
  "description"    TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectSecret_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProjectSecret_projectId_key_unique" UNIQUE ("projectId", "key"),
  CONSTRAINT "ProjectSecret_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ProjectSecret_projectId_idx" ON "ProjectSecret"("projectId");

-- 5. InstalledSkill -------------------------------------------------------
CREATE TABLE "InstalledSkill" (
  "id"            TEXT NOT NULL,
  "projectId"     TEXT NOT NULL,
  "slug"          TEXT NOT NULL,
  "version"       TEXT NOT NULL DEFAULT '0.0.0',
  "source"        TEXT NOT NULL DEFAULT 'bundled',
  "sourceRef"     TEXT,
  "manifestJson"  JSONB NOT NULL,
  "bodyMd"        TEXT NOT NULL,
  "enabled"       BOOLEAN NOT NULL DEFAULT true,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InstalledSkill_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InstalledSkill_projectId_slug_unique" UNIQUE ("projectId", "slug"),
  CONSTRAINT "InstalledSkill_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "InstalledSkill_projectId_idx" ON "InstalledSkill"("projectId");

-- 6. SkillRun -------------------------------------------------------------
CREATE TABLE "SkillRun" (
  "id"              TEXT NOT NULL,
  "agentTaskRunId"  TEXT NOT NULL,
  "slug"            TEXT NOT NULL,
  "args"            JSONB,
  "status"          TEXT NOT NULL DEFAULT 'running',
  "resultSummary"   TEXT,
  "errorMessage"    TEXT,
  "startedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt"         TIMESTAMP(3),
  CONSTRAINT "SkillRun_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SkillRun_agentTaskRunId_fkey"
    FOREIGN KEY ("agentTaskRunId") REFERENCES "AgentTaskRun"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "SkillRun_agentTaskRunId_idx" ON "SkillRun"("agentTaskRunId");
CREATE INDEX "SkillRun_slug_idx" ON "SkillRun"("slug");

-- 7. AgentSubscription ----------------------------------------------------
CREATE TABLE "AgentSubscription" (
  "id"          TEXT NOT NULL,
  "agentId"     TEXT NOT NULL,
  "projectId"   TEXT NOT NULL,
  "source"      TEXT NOT NULL,
  "sourceRef"   TEXT NOT NULL,
  "filter"      JSONB,
  "enabled"     BOOLEAN NOT NULL DEFAULT true,
  "lastEventAt" TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AgentSubscription_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AgentSubscription_agentId_fkey"
    FOREIGN KEY ("agentId") REFERENCES "AIAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AgentSubscription_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "AgentSubscription_agentId_idx" ON "AgentSubscription"("agentId");
CREATE INDEX "AgentSubscription_projectId_idx" ON "AgentSubscription"("projectId");
CREATE INDEX "AgentSubscription_source_sourceRef_idx" ON "AgentSubscription"("source", "sourceRef");
