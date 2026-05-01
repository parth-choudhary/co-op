import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { signBody } from './hmac.js';

export interface Job {
  runId: string;
  cardId: string;
  repoFullName: string;     // owner/repo
  baseBranch: string;
  branchName: string;
  briefUrl: string;
  callbackUrl: string;
  installationToken: string;
  installationTokenExpiresIn: number;
  maxWallSeconds: number;
}

const WORK_ROOT = process.env.COOP_WORK_ROOT || '/var/coop/work';

async function postStatus(job: Job, body: Record<string, unknown>): Promise<void> {
  const payload = JSON.stringify({ runId: job.runId, ...body });
  const sig = signBody(payload);
  try {
    const res = await fetch(job.callbackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Coop-Signature': sig },
      body: payload,
    });
    if (!res.ok) console.error(`[worker] callback ${res.status}: ${await res.text()}`);
  } catch (err) {
    console.error('[worker] callback failed:', err);
  }
}

interface RunOpts { cwd: string; env?: Record<string, string>; timeoutMs?: number; input?: string }
function run(cmd: string, args: string[], opts: RunOpts): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: { ...process.env, ...(opts.env || {}) },
    });
    let stdout = '';
    let stderr = '';
    let timer: NodeJS.Timeout | null = null;
    if (opts.timeoutMs) {
      timer = setTimeout(() => { child.kill('SIGKILL'); }, opts.timeoutMs);
    }
    child.stdout.on('data', (b) => { stdout += b.toString(); });
    child.stderr.on('data', (b) => { stderr += b.toString(); });
    child.on('error', (err) => { if (timer) clearTimeout(timer); reject(err); });
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      resolve({ stdout, stderr, code: code ?? 1 });
    });
    if (opts.input) child.stdin.end(opts.input);
    else child.stdin.end();
  });
}

export async function runJob(job: Job): Promise<void> {
  const workDir = path.join(WORK_ROOT, job.runId);
  await mkdir(workDir, { recursive: true });
  await postStatus(job, { status: 'claimed' });

  try {
    await postStatus(job, { status: 'running' });

    // Clone via short-lived installation token. https://x-access-token:<TOKEN>@github.com/owner/repo
    const cloneUrl = `https://x-access-token:${job.installationToken}@github.com/${job.repoFullName}.git`;
    const clone = await run('git', ['clone', '--depth', '50', '--branch', job.baseBranch, cloneUrl, 'repo'],
      { cwd: workDir, timeoutMs: 5 * 60_000 });
    if (clone.code !== 0) throw new Error(`git clone failed: ${clone.stderr.slice(-400)}`);

    const repoDir = path.join(workDir, 'repo');
    await run('git', ['config', 'user.name', 'co-op agent'], { cwd: repoDir });
    await run('git', ['config', 'user.email', 'agent@co-op.local'], { cwd: repoDir });
    await run('git', ['checkout', '-b', job.branchName], { cwd: repoDir });

    // Fetch the brief — text/markdown body.
    const briefRes = await fetch(job.briefUrl);
    if (!briefRes.ok) throw new Error(`brief fetch failed: ${briefRes.status}`);
    const brief = await briefRes.text();
    const briefPath = path.join(workDir, 'brief.md');
    await writeFile(briefPath, brief);

    // Run the coding agent — Claude Code in headless mode, brief on stdin.
    const wallMs = Math.max(60_000, job.maxWallSeconds * 1000);
    const agentEnv: Record<string, string> = {};
    if (process.env.ANTHROPIC_API_KEY) agentEnv.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    const agent = await run(
      'npx',
      ['--yes', '@anthropic-ai/claude-code', '--dangerously-skip-permissions', '--print'],
      { cwd: repoDir, input: brief, timeoutMs: wallMs, env: agentEnv },
    );
    if (agent.code !== 0) {
      console.error(`[worker] agent exited ${agent.code}: ${agent.stderr.slice(-400)}`);
      // Continue — even a partial diff might be worth pushing.
    }

    // Stage and commit anything that changed.
    await run('git', ['add', '-A'], { cwd: repoDir });
    const diff = await run('git', ['diff', '--cached', '--quiet'], { cwd: repoDir });
    if (diff.code === 0) {
      await postStatus(job, { status: 'no_changes', errorMessage: 'agent produced no file changes' });
      return;
    }
    const commit = await run('git', ['commit', '-m', `co-op: ${job.runId}`], { cwd: repoDir });
    if (commit.code !== 0) throw new Error(`git commit failed: ${commit.stderr.slice(-400)}`);
    const sha = (await run('git', ['rev-parse', 'HEAD'], { cwd: repoDir })).stdout.trim();

    // Push.
    const push = await run('git', ['push', '--set-upstream', 'origin', job.branchName],
      { cwd: repoDir, timeoutMs: 5 * 60_000 });
    if (push.code !== 0) throw new Error(`git push failed: ${push.stderr.slice(-400)}`);
    await postStatus(job, { status: 'pushed', commitSha: sha, branchName: job.branchName });

    // Open PR via the GitHub REST API using the same installation token.
    const [owner, repo] = job.repoFullName.split('/');
    const prRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `token ${job.installationToken}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: `[co-op] run ${job.runId}`,
        head: job.branchName,
        base: job.baseBranch,
        body: `Automated run from co-op (ssh worker).\n\nrunId: ${job.runId}\ncardId: ${job.cardId}\n\n---\n\n${brief}`,
      }),
    });
    if (!prRes.ok) {
      const txt = await prRes.text();
      throw new Error(`PR create failed (${prRes.status}): ${txt.slice(0, 400)}`);
    }
    const pr: any = await prRes.json();
    await postStatus(job, { status: 'pr_opened', prNumber: pr.number, prUrl: pr.html_url, commitSha: sha });
  } catch (err: any) {
    await postStatus(job, { status: 'failed', errorMessage: err?.message || String(err) });
  } finally {
    // Best-effort cleanup; leave on disk for debugging if KEEP_WORKDIR is set.
    if (!process.env.KEEP_WORKDIR) {
      await rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
