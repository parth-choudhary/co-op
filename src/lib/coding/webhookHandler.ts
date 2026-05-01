import prisma from '@/lib/db';
import { mergePullRequest } from './githubApp';

// Extract runId from a branch name like "coop/run-<cuid>". Returns null if the
// branch isn't ours.
export function runIdFromBranch(branch: string | null | undefined): string | null {
  if (!branch) return null;
  const m = /^coop\/run-(.+)$/.exec(branch);
  return m ? m[1] : null;
}

function terminal(status: string) {
  return ['completed', 'failed', 'merged', 'cancelled'].includes(status);
}

async function updateRun(runId: string, data: any, cardPatch?: any) {
  const updated = await prisma.agentTaskRun.update({ where: { id: runId }, data });
  if (cardPatch && updated.cardId) {
    await prisma.card.update({ where: { id: updated.cardId }, data: cardPatch });
  }
  if (terminal(updated.status) && updated.cardId) {
    await prisma.card.updateMany({ where: { id: updated.cardId, activeRunId: runId }, data: { activeRunId: null } });
  }
  return updated;
}

export async function handlePullRequestEvent(payload: any): Promise<void> {
  const pr = payload.pull_request;
  if (!pr) return;
  const branch = pr.head?.ref as string | undefined;
  const runId = runIdFromBranch(branch);
  if (!runId) return;

  const run = await prisma.agentTaskRun.findUnique({ where: { id: runId } });
  if (!run) return;
  if (terminal(run.status)) return;

  const action = payload.action as string;
  const prNumber = pr.number as number;
  const prUrl = pr.html_url as string;
  const commitSha = pr.head?.sha as string | undefined;

  if (['opened', 'reopened', 'synchronize', 'edited'].includes(action)) {
    const nextStatus = run.status === 'merged' ? 'merged' : 'pr_opened';
    await updateRun(runId, { status: nextStatus, prNumber, prUrl, commitSha },
      { lastPrUrl: prUrl, lastPrStatus: 'open' });
  } else if (action === 'closed') {
    if (pr.merged) {
      await updateRun(runId, { status: 'merged', prNumber, prUrl, commitSha, finishedAt: new Date() },
        { lastPrUrl: prUrl, lastPrStatus: 'merged' });
    } else {
      await updateRun(runId, { status: 'cancelled', prNumber, prUrl, commitSha, finishedAt: new Date(), errorMessage: 'PR closed without merging' },
        { lastPrUrl: prUrl, lastPrStatus: 'closed' });
    }
  }
}

export async function handleCheckSuiteEvent(payload: any): Promise<void> {
  const suite = payload.check_suite;
  if (!suite) return;
  const branch = suite.head_branch as string | undefined;
  const runId = runIdFromBranch(branch);
  if (!runId) return;

  const run = await prisma.agentTaskRun.findUnique({ where: { id: runId } });
  if (!run || terminal(run.status)) return;

  if (suite.status === 'queued' || suite.status === 'in_progress') {
    if (run.status !== 'checks_running' && run.status === 'pr_opened') {
      await updateRun(runId, { status: 'checks_running' });
    }
    return;
  }

  if (suite.status === 'completed') {
    const conclusion = suite.conclusion as string; // success, failure, cancelled, timed_out, action_required, neutral, skipped, stale
    if (conclusion === 'success' || conclusion === 'neutral' || conclusion === 'skipped') {
      await updateRun(runId, { status: 'checks_passed' });
      await maybeAutoMerge(runId);
    } else {
      await updateRun(runId, { status: 'checks_failed', errorMessage: `Checks ${conclusion}` });
    }
  }
}

export async function handleWorkflowRunEvent(payload: any): Promise<void> {
  // Mostly used to capture a logs URL so the UI can link out.
  const wf = payload.workflow_run;
  if (!wf) return;
  const branch = wf.head_branch as string | undefined;
  const runId = runIdFromBranch(branch);
  if (!runId) return;

  const run = await prisma.agentTaskRun.findUnique({ where: { id: runId } });
  if (!run) return;
  const logsUrl = wf.html_url as string | undefined;
  if (logsUrl && run.logsUrl !== logsUrl) {
    await prisma.agentTaskRun.update({ where: { id: runId }, data: { logsUrl } });
  }
  if (wf.status === 'completed' && (wf.conclusion === 'failure' || wf.conclusion === 'cancelled' || wf.conclusion === 'timed_out')) {
    // Only mark failed if we haven't progressed past PR opening — after PR
    // opens, CI checks drive status.
    if (run.status === 'dispatched' || run.status === 'running') {
      await updateRun(runId, { status: 'failed', errorMessage: `Workflow ${wf.conclusion}`, finishedAt: new Date() });
    }
  }
}

async function maybeAutoMerge(runId: string): Promise<void> {
  const run = await prisma.agentTaskRun.findUnique({ where: { id: runId } });
  if (!run || !run.prNumber) return;
  const cfg = await prisma.projectCodeConfig.findUnique({ where: { projectId: run.projectId } });
  if (!cfg || !cfg.ghInstallationId || !cfg.repoFullName) return;
  if (cfg.mergePolicy === 'human_pr') return;
  try {
    const res = await mergePullRequest({
      installationId: cfg.ghInstallationId,
      repoFullName: cfg.repoFullName,
      pullNumber: run.prNumber,
      mergeMethod: 'squash',
    });
    if (res.merged) {
      await updateRun(runId, { status: 'merged', finishedAt: new Date(), commitSha: res.sha || undefined },
        { lastPrStatus: 'merged' });
    }
  } catch (err: any) {
    // Leave the run at checks_passed — the human can still merge.
    await prisma.agentTaskRun.update({
      where: { id: runId },
      data: { errorMessage: `auto-merge failed: ${err?.message || 'unknown'}` },
    });
  }
}
