import { spawn } from 'node:child_process';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import prisma from '@/lib/db';
import { compileBrief } from './brief';

export function localModeEnabled(): boolean { return process.env.COOP_LOCAL_MODE === '1'; }

// Root for per-run worktrees. Defaults to $TMPDIR/coop-work.
function workRoot(): string {
  return process.env.COOP_WORK_ROOT || path.join(os.tmpdir(), 'coop-work');
}

interface RunOpts { cwd: string; env?: Record<string, string>; timeoutMs?: number; input?: string; stdio?: 'inherit' | 'pipe' }

function run(cmd: string, args: string[], opts: RunOpts): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, env: { ...process.env, ...(opts.env || {}) } });
    let stdout = ''; let stderr = '';
    let timer: NodeJS.Timeout | null = null;
    if (opts.timeoutMs) timer = setTimeout(() => { child.kill('SIGKILL'); }, opts.timeoutMs);
    child.stdout.on('data', (b) => { stdout += b.toString(); });
    child.stderr.on('data', (b) => { stderr += b.toString(); });
    child.on('error', (err) => { if (timer) clearTimeout(timer); reject(err); });
    child.on('close', (code) => { if (timer) clearTimeout(timer); resolve({ stdout, stderr, code: code ?? 1 }); });
    if (opts.input) child.stdin.end(opts.input);
    else child.stdin.end();
  });
}

async function patch(runId: string, data: Record<string, unknown>): Promise<void> {
  await prisma.agentTaskRun.update({ where: { id: runId }, data }).catch((e: any) => {
    console.error(`[localRunner] failed to patch ${runId}:`, e?.message || e);
  });
}

async function finish(runId: string, status: string, extra: Record<string, unknown> = {}): Promise<void> {
  const run = await prisma.agentTaskRun.findUnique({ where: { id: runId }, select: { cardId: true } });
  await prisma.agentTaskRun.update({
    where: { id: runId },
    data: { status, finishedAt: new Date(), ...extra },
  });
  if (run?.cardId) {
    await prisma.card.updateMany({ where: { id: run.cardId, activeRunId: runId }, data: { activeRunId: null } });
  }
}

async function ensureDir(p: string): Promise<void> { await mkdir(p, { recursive: true }); }

async function isGitRepo(dir: string): Promise<boolean> {
  const g = await run('git', ['-C', dir, 'rev-parse', '--is-inside-work-tree'], { cwd: dir }).catch(() => null);
  return !!g && g.code === 0 && g.stdout.trim() === 'true';
}

export async function runLocalJob(runId: string): Promise<void> {
  if (!localModeEnabled()) {
    await finish(runId, 'failed', { errorMessage: 'Local-git mode is not enabled on this deployment' });
    return;
  }

  const runRow = await prisma.agentTaskRun.findUnique({ where: { id: runId } });
  if (!runRow) return;
  const cfg = await prisma.projectCodeConfig.findUnique({ where: { projectId: runRow.projectId } });
  if (!cfg || !cfg.localRepoPath) {
    await finish(runId, 'failed', { errorMessage: 'localRepoPath is not configured' });
    return;
  }

  // Validate the path actually exists and is a git repo.
  try {
    const s = await stat(cfg.localRepoPath);
    if (!s.isDirectory()) throw new Error('not a directory');
  } catch (err: any) {
    await finish(runId, 'failed', { errorMessage: `localRepoPath not usable: ${err?.message || err}` });
    return;
  }
  if (!(await isGitRepo(cfg.localRepoPath))) {
    await finish(runId, 'failed', { errorMessage: 'localRepoPath is not a git working tree' });
    return;
  }

  const branchName = `coop/run-${runId}`;
  const baseBranch = cfg.mergePolicy === 'staging_branch' && cfg.stagingBranch ? cfg.stagingBranch : cfg.defaultBranch;
  const workDir = path.join(workRoot(), `run-${runId}`);
  await ensureDir(workRoot());

  try {
    // Compile and snapshot brief.
    const brief = await compileBrief(runId);
    await patch(runId, { taskBrief: brief, branchName, status: 'running' });

    // Add a worktree off the base branch so the user's main checkout is untouched.
    const addWT = await run('git', ['-C', cfg.localRepoPath, 'worktree', 'add', '-b', branchName, workDir, baseBranch], { cwd: cfg.localRepoPath, timeoutMs: 60_000 });
    if (addWT.code !== 0) throw new Error(`git worktree add failed: ${addWT.stderr.slice(-400)}`);

    await run('git', ['config', 'user.name', 'co-op agent'], { cwd: workDir });
    await run('git', ['config', 'user.email', 'agent@co-op.local'], { cwd: workDir });

    const briefPath = path.join(workDir, '.coop-brief.md');
    await writeFile(briefPath, brief);

    // Run claude-code headless with the brief as stdin.
    const wallMs = Math.max(60_000, (cfg.maxWallSecondsPerRun || 1800) * 1000);
    const agent = await run('npx', ['--yes', '@anthropic-ai/claude-code', '--dangerously-skip-permissions', '--print'], {
      cwd: workDir, input: brief, timeoutMs: wallMs,
    });
    if (agent.code !== 0) console.error(`[localRunner] claude-code exit ${agent.code}: ${agent.stderr.slice(-400)}`);

    // Drop the brief before staging so it doesn't land in the commit.
    await rm(briefPath, { force: true });

    await run('git', ['add', '-A'], { cwd: workDir });
    const diff = await run('git', ['diff', '--cached', '--quiet'], { cwd: workDir });
    if (diff.code === 0) {
      await finish(runId, 'failed', { errorMessage: 'agent produced no file changes' });
      return;
    }
    const commit = await run('git', ['commit', '-m', `co-op: ${runId}`], { cwd: workDir });
    if (commit.code !== 0) throw new Error(`git commit failed: ${commit.stderr.slice(-400)}`);
    const sha = (await run('git', ['rev-parse', 'HEAD'], { cwd: workDir })).stdout.trim();

    await patch(runId, { commitSha: sha });

    // Optional push.
    if (cfg.pushToRemote) {
      const push = await run('git', ['push', '-u', 'origin', branchName], { cwd: workDir, timeoutMs: 5 * 60_000 });
      if (push.code !== 0) throw new Error(`git push failed: ${push.stderr.slice(-400)}`);
    }

    // Optional `gh pr create` — relies on `gh auth` on the host.
    let prUrl: string | null = null;
    if (cfg.openPrWithGhCli && cfg.pushToRemote) {
      const pr = await run('gh', [
        'pr', 'create',
        '--base', baseBranch,
        '--head', branchName,
        '--title', `[co-op] run ${runId}`,
        '--body', `Automated run from co-op (local mode).\n\nrunId: ${runId}\n\n---\n\n${brief}`,
      ], { cwd: workDir, timeoutMs: 60_000 });
      if (pr.code === 0) {
        prUrl = (pr.stdout.match(/https?:\S+/) || [null])[0];
      } else {
        console.error(`[localRunner] gh pr create failed: ${pr.stderr.slice(-400)}`);
      }
    }

    if (prUrl) {
      await patch(runId, { prUrl, status: 'pr_opened' });
      await prisma.card.update({ where: { id: runRow.cardId }, data: { lastPrUrl: prUrl, lastPrStatus: 'open' } });
    }

    await finish(runId, 'completed', { commitSha: sha });
  } catch (err: any) {
    await finish(runId, 'failed', { errorMessage: (err?.message || String(err)).slice(0, 4000) });
  } finally {
    // Best-effort worktree cleanup. Leave the branch in the main repo so the
    // user still has the agent's work even if the worktree dir is gone.
    if (cfg.localRepoPath && workDir) {
      await run('git', ['-C', cfg.localRepoPath, 'worktree', 'remove', '--force', workDir], { cwd: cfg.localRepoPath }).catch(() => {});
      await rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
