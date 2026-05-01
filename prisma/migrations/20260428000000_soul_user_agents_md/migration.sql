-- Project-level admin-controlled doctrine that all agents inherit
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "userMd" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "userMdUpdatedAt" TIMESTAMP(3);
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "agentsMd" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "agentsMdUpdatedAt" TIMESTAMP(3);

-- Per-agent voice / persona doc
ALTER TABLE "AIAgent" ADD COLUMN IF NOT EXISTS "soulMd" TEXT;
ALTER TABLE "AIAgent" ADD COLUMN IF NOT EXISTS "soulMdUpdatedAt" TIMESTAMP(3);
