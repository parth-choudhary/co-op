import prisma from '../db';
import { runLocal } from './local';
import { runSsh } from './ssh';

export interface ExecOpts {
  cmd: string;
  cwd?: string;
  timeoutMs?: number;
  stdin?: string;
  env?: Record<string, string>;
}

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  backend: string;
}

export async function ensureSandboxConfig(projectId: string) {
  let cfg = await prisma.projectSandboxConfig.findUnique({ where: { projectId } });
  if (!cfg) {
    cfg = await prisma.projectSandboxConfig.create({
      data: { projectId },
    });
  }
  return cfg;
}

export async function execInSandbox(projectId: string, opts: ExecOpts): Promise<ExecResult> {
  const cfg = await ensureSandboxConfig(projectId);
  if (!cfg.enabled) {
    return { exitCode: 126, stdout: '', stderr: 'Sandbox disabled for this project', durationMs: 0, backend: cfg.backend };
  }
  const timeoutMs = Math.min(opts.timeoutMs ?? 60_000, cfg.maxWallSeconds * 1000);
  const effCwd = opts.cwd || cfg.workspaceDir;
  const env = { ...(opts.env || {}) };
  const started = Date.now();
  switch (cfg.backend) {
    case 'local': {
      const r = await runLocal({ ...opts, cwd: effCwd, timeoutMs, env });
      return { ...r, durationMs: Date.now() - started, backend: 'local' };
    }
    case 'ssh': {
      const r = await runSsh(cfg, { ...opts, cwd: effCwd, timeoutMs, env });
      return { ...r, durationMs: Date.now() - started, backend: 'ssh' };
    }
    case 'openshell': {
      // Placeholder — NVIDIA OpenShell CLI wrapper will go here once the API stabilizes.
      return {
        exitCode: 127,
        stdout: '',
        stderr: 'openshell backend not yet implemented',
        durationMs: Date.now() - started,
        backend: 'openshell',
      };
    }
    default:
      return {
        exitCode: 127,
        stdout: '',
        stderr: `Unknown sandbox backend: ${cfg.backend}`,
        durationMs: Date.now() - started,
        backend: cfg.backend,
      };
  }
}
