-- Third execution mode: run the coding agent against a local checkout on the
-- machine hosting co-op. Intentionally opt-in via COOP_LOCAL_MODE=1 at runtime.
ALTER TABLE "ProjectCodeConfig"
  ADD COLUMN "localRepoPath"   TEXT,
  ADD COLUMN "pushToRemote"    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "openPrWithGhCli" BOOLEAN NOT NULL DEFAULT false;
