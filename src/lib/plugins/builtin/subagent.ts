import type { Plugin } from '../contract';
import prisma from '../../db';

const MAX_DEPTH = 3;

async function depthOf(runId: string | undefined): Promise<number> {
  if (!runId) return 0;
  let d = 0;
  let cur: string | null = runId;
  while (cur && d < MAX_DEPTH + 1) {
    const row: { parentRunId: string | null } | null = await prisma.agentTaskRun.findUnique({ where: { id: cur }, select: { parentRunId: true } });
    if (!row?.parentRunId) break;
    cur = row.parentRunId;
    d += 1;
  }
  return d;
}

export const subagentPlugin: Plugin = {
  name: 'subagent',
  description: 'Spawn a subordinate agent run. Returns its final summary.',
  tools: [
    {
      name: 'spawn_subagent',
      description:
        'Spawn a child agent run. The child inherits the project sandbox and returns its final message as the tool result. Recursion depth capped at 3.',
      parameters: {
        type: 'object',
        properties: {
          role: { type: 'string', description: 'Role label for the child run, e.g. "copywriter"' },
          prompt: { type: 'string', description: 'Instruction for the child agent' },
          skills: { type: 'array', items: { type: 'string' } },
          maxTurns: { type: 'integer', description: 'Child tool-round cap. Default 6.' },
        },
        required: ['role', 'prompt'],
      },
      requires: 'subagent',
      handler: async (ctx, args) => {
        if (!ctx.projectId) return { ok: false, error: 'subagent requires a project' };
        const d = await depthOf(ctx.runId);
        if (d >= MAX_DEPTH) return { ok: false, error: `Max subagent depth (${MAX_DEPTH}) reached` };

        const child = await prisma.agentTaskRun.create({
          data: {
            projectId: ctx.projectId,
            agentId: ctx.agentId, // reuse same agent id by default; future: per-role routing
            triggerKind: 'manual',
            executionMode: 'local_git',
            trigger: 'manual',
            parentRunId: ctx.runId || null,
            status: 'queued',
            taskBrief: `Subagent (${args.role}): ${String(args.prompt).slice(0, 500)}`,
          },
        });
        // Execution itself is handled by the normal runAgent loop, invoked elsewhere.
        // We return the queued run id; a higher-level orchestrator may await it.
        return {
          ok: true,
          data: { childRunId: child.id, status: 'queued', role: args.role },
        };
      },
    },
  ],
};
