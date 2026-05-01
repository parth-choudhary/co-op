ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "about" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "aboutUpdatedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "ProjectAboutProposal" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  "agentId" TEXT,
  "proposedText" TEXT NOT NULL,
  "reason" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectAboutProposal_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE,
  CONSTRAINT "ProjectAboutProposal_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AIAgent"("id") ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS "ProjectAboutProposal_projectId_status_idx" ON "ProjectAboutProposal"("projectId", "status");
CREATE INDEX IF NOT EXISTS "ProjectAboutProposal_agentId_idx" ON "ProjectAboutProposal"("agentId");
