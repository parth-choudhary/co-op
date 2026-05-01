import prisma from '@/lib/db';
import { compileBrief } from './brief';
import { dispatchWorkflow, getInstallationToken, mintBriefToken } from './githubApp';
import { signBody } from './workerHmac';

export class DispatchError extends Error {
  constructor(msg: string, public userFacing = false) { super(msg); }
}

function appBaseUrl(): string {
  const v = process.env.APP_BASE_URL;
  if (!v) throw new DispatchError('APP_BASE_URL is not set');
  return v.replace(/\/$/, '');
}

// Dispatch an AgentTaskRun to its execution environment. Returns when the
// environment has accepted the job (not when the job completes).
export async function dispatchRun(runId: string): Promise<void> {
  const run = await prisma.agentTaskRun.findUnique({ where: { id: runId } });
  if (!run) throw new DispatchError('Run not found');
  if (run.status !== 'queued') throw new DispatchError(`Run is not queued (status=${run.status})`);

  const cfg = await prisma.projectCodeConfig.findUnique({ where: { projectId: run.projectId } });
  if (!cfg) throw new DispatchError('Project code automation not configured', true);

  // Snapshot the compiled brief onto the run so it's immutable even if the card changes.
  const brief = await compileBrief(runId);
  const branchName = `coop/run-${runId}`;

  await prisma.agentTaskRun.update({
    where: { id: runId },
    data: { taskBrief: brief, branchName, status: 'dispatched' },
  });

  try {
    if (run.executionMode === 'github_actions') {
      if (!cfg.ghInstallationId) throw new DispatchError('GitHub App installation ID is not configured', true);
      if (!cfg.repoFullName) throw new DispatchError('Repository is not configured', true);
      if (cfg.mergePolicy === 'staging_branch' && !cfg.stagingBranch) {
        throw new DispatchError('Staging branch is required when merge policy is staging_branch', true);
      }

      const token = mintBriefToken(runId, Math.max(cfg.maxWallSecondsPerRun + 600, 3600));
      // Under staging_branch policy, target staging so an auto-merge after CI
      // never touches production. human_pr and auto_merge target the default
      // branch; auto_merge will be applied by the webhook handler on success.
      const baseBranch = cfg.mergePolicy === 'staging_branch' && cfg.stagingBranch
        ? cfg.stagingBranch
        : cfg.defaultBranch;
      await dispatchWorkflow({
        installationId: cfg.ghInstallationId,
        repoFullName: cfg.repoFullName,
        ref: cfg.defaultBranch,
        inputs: {
          runId,
          cardId: run.cardId,
          briefUrl: `${appBaseUrl()}/api/runs/${runId}/brief?token=${token}`,
          baseBranch,
          branchName,
          maxWallSeconds: String(cfg.maxWallSecondsPerRun),
        },
      });
    } else if (run.executionMode === 'ssh_devbox') {
      if (!cfg.sshHost) throw new DispatchError('SSH host is not configured', true);
      if (!cfg.repoFullName) throw new DispatchError('Repository is not configured', true);
      if (!cfg.ghInstallationId) throw new DispatchError('GitHub App installation ID is not configured for repo access', true);
      if (cfg.mergePolicy === 'staging_branch' && !cfg.stagingBranch) {
        throw new DispatchError('Staging branch is required when merge policy is staging_branch', true);
      }

      const installationToken = await getInstallationToken(cfg.ghInstallationId);
      const briefToken = mintBriefToken(runId, Math.max(cfg.maxWallSecondsPerRun + 600, 3600));
      const baseBranch = cfg.mergePolicy === 'staging_branch' && cfg.stagingBranch
        ? cfg.stagingBranch
        : cfg.defaultBranch;

      const payload = JSON.stringify({
        runId,
        cardId: run.cardId,
        repoFullName: cfg.repoFullName,
        baseBranch,
        branchName,
        briefUrl: `${appBaseUrl()}/api/runs/${runId}/brief?token=${briefToken}`,
        callbackUrl: `${appBaseUrl()}/api/webhooks/worker`,
        installationToken,
        installationTokenExpiresIn: 3600,
        maxWallSeconds: cfg.maxWallSecondsPerRun,
      });
      const sig = signBody(payload);

      const target = cfg.sshHost.startsWith('http') ? cfg.sshHost : `https://${cfg.sshHost}`;
      const url = `${target.replace(/\/$/, '')}/jobs`;

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Coop-Signature': sig.header },
        body: payload,
      }).catch((err) => { throw new DispatchError(`worker unreachable: ${err?.message || err}`, true); });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new DispatchError(`worker rejected job (${res.status}): ${text.slice(0, 200)}`, true);
      }
    } else if (run.executionMode === 'local_git') {
      const { localModeEnabled, runLocalJob } = await import('./localRunner');
      if (!localModeEnabled()) {
        throw new DispatchError('Local-git mode is disabled on this deployment (set COOP_LOCAL_MODE=1)', true);
      }
      if (!cfg.localRepoPath) throw new DispatchError('localRepoPath is not configured', true);
      if (cfg.mergePolicy === 'staging_branch' && !cfg.stagingBranch) {
        throw new DispatchError('Staging branch is required when merge policy is staging_branch', true);
      }
      // Fire and forget — the runner updates AgentTaskRun directly as it progresses.
      setImmediate(() => {
        runLocalJob(runId).catch((err) => console.error(`[dispatch:local_git] ${runId}`, err?.message || err));
      });
    } else {
      throw new DispatchError(`Unknown execution mode: ${run.executionMode}`);
    }
  } catch (err: any) {
    await prisma.agentTaskRun.update({
      where: { id: runId },
      data: { status: 'failed', errorMessage: err?.message || 'dispatch failed', finishedAt: new Date() },
    });
    await prisma.card.updateMany({ where: { id: run.cardId, activeRunId: runId }, data: { activeRunId: null } });
    throw err;
  }
}
