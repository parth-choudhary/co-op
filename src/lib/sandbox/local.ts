import { spawn } from 'child_process';
import { mkdtempSync, existsSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const BASE_WORK = process.env.COOP_SANDBOX_LOCAL_ROOT || join(tmpdir(), 'coop-sandbox');

if (!existsSync(BASE_WORK)) mkdirSync(BASE_WORK, { recursive: true });

export interface LocalRunOpts {
  cmd: string;
  cwd?: string;
  timeoutMs?: number;
  stdin?: string;
  env?: Record<string, string>;
}

export async function runLocal(opts: LocalRunOpts): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  // The "local" backend is a trust boundary: the command runs on the host.
  // It is gated by SANDBOX_LOCAL_ENABLED to avoid accidental enablement in prod.
  if (process.env.SANDBOX_LOCAL_ENABLED !== '1') {
    return { exitCode: 126, stdout: '', stderr: 'local sandbox backend disabled (set SANDBOX_LOCAL_ENABLED=1 to enable in dev)' };
  }
  const cwd = opts.cwd && existsSync(opts.cwd) ? opts.cwd : mkdtempSync(join(BASE_WORK, 'run-'));
  return new Promise((resolve) => {
    const child = spawn('/bin/sh', ['-c', opts.cmd], {
      cwd,
      env: { ...process.env, ...(opts.env || {}) },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let killed = false;
    const timer = opts.timeoutMs
      ? setTimeout(() => {
          killed = true;
          child.kill('SIGKILL');
        }, opts.timeoutMs)
      : null;
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    if (opts.stdin) child.stdin.write(opts.stdin);
    child.stdin.end();
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      resolve({
        exitCode: killed ? 124 : code ?? 0,
        stdout: stdout.slice(0, 100_000),
        stderr: stderr.slice(0, 20_000) + (killed ? '\n[killed: timeout]' : ''),
      });
    });
    child.on('error', (err) => {
      if (timer) clearTimeout(timer);
      resolve({ exitCode: 1, stdout, stderr: stderr + '\n' + err.message });
    });
  });
}
