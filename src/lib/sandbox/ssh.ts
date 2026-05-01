import { spawn } from 'child_process';
import { writeFileSync, mkdtempSync, chmodSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { tryDecrypt } from '../crypto';

interface SshConfig {
  sshHost: string | null;
  sshUser: string | null;
  sshKeyEncrypted: string | null;
  workspaceDir: string;
}

interface SshRunOpts {
  cmd: string;
  cwd?: string;
  timeoutMs?: number;
  stdin?: string;
  env?: Record<string, string>;
}

export async function runSsh(cfg: SshConfig, opts: SshRunOpts): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  if (!cfg.sshHost) {
    return { exitCode: 127, stdout: '', stderr: 'SSH host not configured on ProjectSandboxConfig' };
  }
  const key = tryDecrypt(cfg.sshKeyEncrypted);
  let keyPath: string | null = null;
  const tmp = mkdtempSync(join(tmpdir(), 'coop-ssh-'));
  try {
    if (key) {
      keyPath = join(tmp, 'id');
      writeFileSync(keyPath, key, { mode: 0o600 });
      chmodSync(keyPath, 0o600);
    }
    const envPrefix = Object.entries(opts.env || {})
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join(' ');
    const cdPrefix = opts.cwd ? `cd ${JSON.stringify(opts.cwd)} && ` : '';
    const remoteCmd = `${cdPrefix}${envPrefix ? envPrefix + ' ' : ''}${opts.cmd}`;
    const target = cfg.sshUser ? `${cfg.sshUser}@${cfg.sshHost}` : cfg.sshHost;
    const args = [
      '-o', 'BatchMode=yes',
      '-o', 'StrictHostKeyChecking=no',
      ...(keyPath ? ['-i', keyPath] : []),
      target,
      remoteCmd,
    ];
    return await new Promise((resolve) => {
      const child = spawn('ssh', args, { stdio: ['pipe', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      let killed = false;
      const timer = opts.timeoutMs
        ? setTimeout(() => { killed = true; child.kill('SIGKILL'); }, opts.timeoutMs)
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
    });
  } finally {
    if (keyPath) { try { unlinkSync(keyPath); } catch {} }
  }
}
