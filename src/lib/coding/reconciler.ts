import prisma from '@/lib/db';
import {
  cancelWorkflowRunsForBranch,
  findOpenPRForBranch,
  getCombinedStatus,
  getPullRequest,
  mergePullRequest,
} from './githubApp';

export interface ReconcileSummary {
  scanned: number;
  failedOnTimeout: number;
  prDiscovered: number;
  checksUpdated: number;
  merged: number;
  errors: Array<{ runId: string; error: string }>;
}

const ACTIVE_STATUSES = ['queued', 'dispatched', 'running', 'pr_opened', 'checks_running', 'checks_passed', 'checks_failed'];

export async function reconcileRuns(): Promise<ReconcileSummary> {
  const summary: ReconcileSummary = { scanned: 0, failedOnTimeout: 0, prDiscovered: 0, checksUpdated: 0, merged: 0, errors: [] };
  const runs = await prisma.agentTaskRun.findMany({ where: { status: { in: ACTIVE_STATUSES } }, orderBy: { startedAt: 'asc' }, take: 200 });
  summary.scanned = runs.length;

  for (const run of runs) {
    try {
      await reconcileOne(run, summary);
    } catch (err: any) {
      summary.errors.push({ runId: run.id, error: err?.message || String(err) });
    }
  }
  return summary;
}

async function reconcileOne(run: any, summary: ReconcileSummary): Promise<void> {
  const cfg = await prisma.projectCodeConfig.findUnique({ where: { projectId: run.projectId } });
  if (!cfg) return;

  // 1. Timeout check — wall budget plus a generous slack for PR review states.
  const slackSeconds = ['checks_passed', 'pr_opened', 'checks_running'].includes(run.status) ? 6 * 3600 : 600;
  const cap = (cfg.maxWallSecondsPerRun || 1800) + slackSeconds;
  const ageSec = Math.floor((Date.now() - new Date(run.startedAt).getTime()) / 1000);
  if (ageSec > cap && !['checks_passed', 'pr_opened', 'checks_running', 'checks_failed'].includes(run.status)) {
    await prisma.agentTaskRun.update({
      where: { id: run.id },
      data: { status: 'failed', errorMessage: `Timed out after ${ageSec}s (cap=${cap}s)`, finishedAt: new Date() },
    });
    await prisma.card.updateMany({ where: { id: run.cardId, activeRunId: run.id }, data: { activeRunId: null } });
    if (run.executionMode === 'github_actions' && cfg.ghInstallationId && cfg.repoFullName && run.branchName) {
      cancelWorkflowRunsForBranch({
        installationId: cfg.ghInstallationId, repoFullName: cfg.repoFullName, branch: run.branchName,
      }).catch(() => {});
    }
    summary.failedOnTimeout++;
    return;
  }

  if (run.executionMode !== 'github_actions') return; // SSH reconciliation lives elsewhere
  if (!cfg.ghInstallationId || !cfg.repoFullName || !run.branchName) return;

  // 2. Discover the PR if we don't have one yet (webhook missed).
  if (!run.prNumber) {
    const pr = await findOpenPRForBranch({
      installationId: cfg.ghInstallationId, repoFullName: cfg.repoFullName, branch: run.branchName,
    });
    if (pr) {
      await prisma.agentTaskRun.update({
        where: { id: run.id },
        data: { status: 'pr_opened', prNumber: pr.number, prUrl: pr.html_url, commitSha: pr.head_sha },
      });
      await prisma.card.update({ where: { id: run.cardId }, data: { lastPrUrl: pr.html_url, lastPrStatus: 'open' } });
      summary.prDiscovered++;
      run.prNumber = pr.number;
      run.prUrl = pr.html_url;
      run.commitSha = pr.head_sha;
      run.status = 'pr_opened';
    }
  }

  // 3. If we have a PR, refresh PR + check status.
  if (run.prNumber) {
    const pr = await getPullRequest({
      installationId: cfg.ghInstallationId, repoFullName: cfg.repoFullName, pullNumber: run.prNumber,
    });
    if (pr) {
      if (pr.merged && run.status !== 'merged') {
        await prisma.agentTaskRun.update({
          where: { id: run.id },
          data: { status: 'merged', finishedAt: new Date(), commitSha: pr.head_sha },
        });
        await prisma.card.update({ where: { id: run.cardId }, data: { lastPrStatus: 'merged', activeRunId: null } });
        summary.merged++;
        return;
      }
      if (pr.state === 'closed' && !pr.merged && !['cancelled', 'failed'].includes(run.status)) {
        await prisma.agentTaskRun.update({
          where: { id: run.id },
          data: { status: 'cancelled', errorMessage: 'PR closed without merging', finishedAt: new Date() },
        });
        await prisma.card.update({ where: { id: run.cardId }, data: { lastPrStatus: 'closed', activeRunId: null } });
        return;
      }

      // 4. Check status → drive checks_running/passed/failed if webhook missed.
      const status = await getCombinedStatus({
        installationId: cfg.ghInstallationId, repoFullName: cfg.repoFullName, ref: pr.head_sha,
      });
      let nextStatus: string | null = null;
      if (status === 'pending') nextStatus = 'checks_running';
      else if (status === 'success') nextStatus = 'checks_passed';
      else if (status === 'failure') nextStatus = 'checks_failed';
      if (nextStatus && nextStatus !== run.status) {
        await prisma.agentTaskRun.update({
          where: { id: run.id },
          data: { status: nextStatus, errorMessage: nextStatus === 'checks_failed' ? 'Checks failed' : null },
        });
        summary.checksUpdated++;
        run.status = nextStatus;
      }

      // 5. Auto-merge gate — only when checks pass and policy allows.
      if (run.status === 'checks_passed' && cfg.mergePolicy !== 'human_pr') {
        try {
          const res = await mergePullRequest({
            installationId: cfg.ghInstallationId, repoFullName: cfg.repoFullName,
            pullNumber: run.prNumber, mergeMethod: 'squash',
          });
          if (res.merged) {
            await prisma.agentTaskRun.update({
              where: { id: run.id },
              data: { status: 'merged', finishedAt: new Date(), commitSha: res.sha || undefined },
            });
            await prisma.card.update({ where: { id: run.cardId }, data: { lastPrStatus: 'merged', activeRunId: null } });
            summary.merged++;
          }
        } catch (err: any) {
          await prisma.agentTaskRun.update({
            where: { id: run.id }, data: { errorMessage: `auto-merge failed: ${err?.message || 'unknown'}` },
          });
        }
      }
    }
  }
}
