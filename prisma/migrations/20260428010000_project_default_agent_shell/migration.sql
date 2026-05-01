-- Project-level default for whether new agents get the shell capability.
-- Per-agent override remains available in the agent's plugins array.
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "defaultAgentShell" BOOLEAN NOT NULL DEFAULT false;
