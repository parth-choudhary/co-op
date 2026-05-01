import crypto from 'node:crypto';
import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';

function appId(): string {
  const v = process.env.GITHUB_APP_ID;
  if (!v) throw new Error('GITHUB_APP_ID is not set');
  return v;
}
function appPrivateKey(): string {
  const v = process.env.GITHUB_APP_PRIVATE_KEY;
  if (!v) throw new Error('GITHUB_APP_PRIVATE_KEY is not set');
  // Env vars commonly ship with \n escapes; normalise.
  return v.includes('\\n') ? v.replace(/\\n/g, '\n') : v;
}
function webhookSecret(): string {
  const v = process.env.GITHUB_APP_WEBHOOK_SECRET;
  if (!v) throw new Error('GITHUB_APP_WEBHOOK_SECRET is not set');
  return v;
}

export function installationOctokit(installationId: string | number): Octokit {
  return new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: appId(),
      privateKey: appPrivateKey(),
      installationId: Number(installationId),
    },
  });
}

export async function getInstallationToken(installationId: string | number): Promise<string> {
  const auth = createAppAuth({ appId: appId(), privateKey: appPrivateKey() });
  const res = await auth({ type: 'installation', installationId: Number(installationId) });
  return (res as any).token as string;
}

export function parseRepoFullName(repoFullName: string): { owner: string; repo: string } {
  const [owner, repo] = repoFullName.split('/');
  if (!owner || !repo) throw new Error(`Invalid repoFullName: ${repoFullName}`);
  return { owner, repo };
}

export async function dispatchWorkflow(opts: {
  installationId: string;
  repoFullName: string;
  workflowFile?: string;
  ref: string;
  inputs: Record<string, string>;
}): Promise<void> {
  const { owner, repo } = parseRepoFullName(opts.repoFullName);
  const octo = installationOctokit(opts.installationId);
  await octo.request('POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches', {
    owner,
    repo,
    workflow_id: opts.workflowFile || 'coop-agent.yml',
    ref: opts.ref,
    inputs: opts.inputs,
  });
}

export async function findOpenPRForBranch(opts: {
  installationId: string;
  repoFullName: string;
  branch: string;
}): Promise<{ number: number; html_url: string; head_sha: string } | null> {
  const { owner, repo } = parseRepoFullName(opts.repoFullName);
  const octo = installationOctokit(opts.installationId);
  const res = await octo.pulls.list({ owner, repo, head: `${owner}:${opts.branch}`, state: 'open', per_page: 1 });
  const pr = res.data[0];
  if (!pr) return null;
  return { number: pr.number, html_url: pr.html_url, head_sha: pr.head.sha };
}

export async function getPullRequest(opts: {
  installationId: string;
  repoFullName: string;
  pullNumber: number;
}): Promise<{ state: string; merged: boolean; html_url: string; head_sha: string; mergeable: boolean | null } | null> {
  const { owner, repo } = parseRepoFullName(opts.repoFullName);
  const octo = installationOctokit(opts.installationId);
  try {
    const res = await octo.pulls.get({ owner, repo, pull_number: opts.pullNumber });
    return {
      state: res.data.state, merged: !!res.data.merged,
      html_url: res.data.html_url, head_sha: res.data.head.sha,
      mergeable: res.data.mergeable ?? null,
    };
  } catch { return null; }
}

export async function getCombinedStatus(opts: {
  installationId: string;
  repoFullName: string;
  ref: string;
}): Promise<'success' | 'failure' | 'pending' | 'none'> {
  const { owner, repo } = parseRepoFullName(opts.repoFullName);
  const octo = installationOctokit(opts.installationId);
  // Combined check-runs + commit statuses.
  const [checks, status] = await Promise.all([
    octo.checks.listForRef({ owner, repo, ref: opts.ref }),
    octo.repos.getCombinedStatusForRef({ owner, repo, ref: opts.ref }).catch(() => null),
  ]);
  const total = (checks.data.total_count || 0) + (status?.data.statuses?.length || 0);
  if (total === 0) return 'none';
  const hasFailure = checks.data.check_runs.some((c: any) => ['failure', 'cancelled', 'timed_out', 'action_required'].includes(c.conclusion || ''))
    || (status?.data.state === 'failure' || status?.data.state === 'error');
  if (hasFailure) return 'failure';
  const allDone = checks.data.check_runs.every((c: any) => c.status === 'completed') && (status?.data.state !== 'pending');
  if (!allDone) return 'pending';
  return 'success';
}

export async function cancelWorkflowRunsForBranch(opts: {
  installationId: string;
  repoFullName: string;
  branch: string;
}): Promise<number> {
  const { owner, repo } = parseRepoFullName(opts.repoFullName);
  const octo = installationOctokit(opts.installationId);
  const list = await octo.actions.listWorkflowRunsForRepo({
    owner, repo, branch: opts.branch, per_page: 20,
  });
  let cancelled = 0;
  for (const wr of list.data.workflow_runs) {
    if (wr.status === 'completed') continue;
    try {
      await octo.actions.cancelWorkflowRun({ owner, repo, run_id: wr.id });
      cancelled++;
    } catch { /* best effort */ }
  }
  return cancelled;
}

export async function mergePullRequest(opts: {
  installationId: string;
  repoFullName: string;
  pullNumber: number;
  mergeMethod?: 'merge' | 'squash' | 'rebase';
}): Promise<{ merged: boolean; sha?: string }> {
  const { owner, repo } = parseRepoFullName(opts.repoFullName);
  const octo = installationOctokit(opts.installationId);
  const res = await octo.pulls.merge({
    owner, repo, pull_number: opts.pullNumber,
    merge_method: opts.mergeMethod || 'squash',
  });
  return { merged: !!res.data.merged, sha: res.data.sha };
}

// Signed token minted for the GHA workflow to fetch the task brief.
// Short-lived, single-run scoped. HMAC over runId + exp with the webhook secret
// (good enough — it's a one-shot fetch from within a trusted workflow).
export function mintBriefToken(runId: string, ttlSeconds = 3600): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `${runId}.${exp}`;
  const sig = crypto.createHmac('sha256', webhookSecret()).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

export function verifyBriefToken(token: string, runId: string): boolean {
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [rid, exp, sig] = parts;
  if (rid !== runId) return false;
  if (!/^\d+$/.test(exp)) return false;
  if (Number(exp) < Math.floor(Date.now() / 1000)) return false;
  const expected = crypto.createHmac('sha256', webhookSecret()).update(`${rid}.${exp}`).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

export function verifyWebhookSignature(rawBody: string | Buffer, signatureHeader: string | null): boolean {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false;
  const expected = crypto.createHmac('sha256', webhookSecret())
    .update(typeof rawBody === 'string' ? rawBody : rawBody)
    .digest('hex');
  const received = signatureHeader.slice('sha256='.length);
  try {
    return crypto.timingSafeEqual(Buffer.from(received, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}
