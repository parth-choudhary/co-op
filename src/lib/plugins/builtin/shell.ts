import type { Plugin } from '../contract';
import { execInSandbox } from '../../sandbox/dispatch';
import { loadProjectSecretsAsEnv } from '../../skills/credBridge';
import prisma from '../../db';

export const shellPlugin: Plugin = {
  name: 'shell',
  description:
    'Run shell commands in the project sandbox. Gated by capability — only exposed when the agent has "shell" in plugins, or inside a skill window that grants it.',
  tools: [
    {
      name: 'exec_shell',
      description:
        'Execute a shell command inside the project sandbox. Stdout/stderr are returned. Do not use for destructive, long-running, or interactive commands.',
      parameters: {
        type: 'object',
        properties: {
          cmd: { type: 'string', description: 'Command to run. Passed to /bin/sh -c' },
          cwd: { type: 'string', description: 'Working directory inside the sandbox. Defaults to the project workspace.' },
          timeoutMs: { type: 'integer', description: 'Max wall time. Defaults to 60_000.' },
          stdin: { type: 'string', description: 'Optional stdin to feed the process' },
        },
        required: ['cmd'],
      },
      requires: 'shell',
      handler: async (ctx, args) => {
        if (!ctx.projectId) return { ok: false, error: 'exec_shell requires a project' };
        const cmd = String(args.cmd || '').trim();
        if (!cmd) return { ok: false, error: 'cmd is required' };
        const env = await loadProjectSecretsAsEnv(ctx.projectId);
        const allowList = ctx.frame?.grantedCapabilities || [];
        const isInSkillFrame = !!ctx.frame?.skillSlug;
        // Outside a skill frame, shell must be explicitly granted to the agent.
        if (!isInSkillFrame) {
          const agent = await prisma.aIAgent.findUnique({ where: { id: ctx.agentId }, select: { plugins: true } });
          const plugins = agent?.plugins ?? [];
          if (!plugins.includes('shell')) {
            return { ok: false, error: 'shell capability not granted to this agent' };
          }
        } else if (!allowList.includes('shell') && !allowList.includes('exec_shell')) {
          return { ok: false, error: 'Current skill frame does not grant shell access' };
        }
        const res = await execInSandbox(ctx.projectId, {
          cmd,
          cwd: typeof args.cwd === 'string' ? args.cwd : undefined,
          timeoutMs: typeof args.timeoutMs === 'number' ? args.timeoutMs : 60_000,
          stdin: typeof args.stdin === 'string' ? args.stdin : undefined,
          env,
        });
        await prisma.agentActivityLog.create({
          data: {
            agentId: ctx.agentId,
            eventType: 'chat_message', // reuse existing enum for now
            payload: {
              kind: 'exec_shell',
              cmd,
              exitCode: res.exitCode,
              stdoutHead: res.stdout.slice(0, 4000),
              stderrHead: res.stderr.slice(0, 2000),
              runId: ctx.runId,
              skillSlug: ctx.frame?.skillSlug,
            } as any,
          },
        });
        return { ok: res.exitCode === 0, data: res };
      },
    },
  ],
};
