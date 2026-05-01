import type { Plugin } from '../contract';
import prisma from '../../db';
import { parseWhen, nextCronMatch } from '../../scheduler/cronNext';

export const schedulerPlugin: Plugin = {
  name: 'scheduler',
  description: 'Schedule one-shot reminders and recurring agent tasks. Use when the user asks for anything that should happen later.',
  tools: [
    {
      name: 'schedule_task',
      description:
        'Persist a task to run later. Use when the user asks you to remind them, run something at a time, or do something on a schedule. The LLM that runs on the scheduled tick will receive `prompt` as its user message.',
      parameters: {
        type: 'object',
        properties: {
          when: {
            type: 'string',
            description: 'When to run. One of: `in:<N><unit>` (e.g. `in:2m`, `in:3h`, `in:1d`), `at:<ISO8601>`, or `cron:<expr>` (5-field, minute hour dom month dow).',
          },
          prompt: {
            type: 'string',
            description: 'Instruction the agent will receive when the schedule fires. Include enough context that it can act without you being there.',
          },
          title: {
            type: 'string',
            description: 'Short label shown in the UI (e.g. "Drink water reminder", "Weekly summary").',
          },
          cardId: {
            type: 'string',
            description: 'Optional card this schedule relates to. The fired run will be card-scoped.',
          },
          sessionKey: {
            type: 'string',
            description: 'Optional conversation key to thread the fired run into an existing chat/DM transcript.',
          },
          targetAgentId: {
            type: 'string',
            description: 'Optional: schedule for a different agent. Defaults to self.',
          },
        },
        required: ['when', 'prompt'],
      },
      requires: 'scheduler',
      handler: async (ctx, args) => {
        if (!ctx.projectId) return { ok: false, error: 'scheduler requires a project' };
        const when = String(args.when || '').trim();
        const prompt = String(args.prompt || '').trim();
        if (!when || !prompt) return { ok: false, error: 'when and prompt are required' };
        let parsed;
        try { parsed = parseWhen(when); }
        catch (e: any) { return { ok: false, error: e.message }; }

        const targetAgent = String(args.targetAgentId || ctx.agentId);
        const nextRunAt = parsed.kind === 'recurring' ? nextCronMatch(parsed.cronExpr!, new Date()) : parsed.runAt!;
        if (nextRunAt.getTime() <= Date.now()) {
          return { ok: false, error: 'Scheduled time is in the past. Use a future time.' };
        }

        // Capture delivery target so the fired run posts back to the
        // originating chat room / card. Explicit args win over the ambient ctx.
        const deliveryPayload = {
          matrixRoomId: ctx.delivery?.matrixRoomId || null,
          roomId: ctx.delivery?.roomId || null,
          replyToCommentId: ctx.delivery?.replyToCommentId || null,
        };
        const effectiveCardId = (typeof args.cardId === 'string' && args.cardId)
          ? args.cardId
          : (ctx.delivery?.cardId || null);

        const job = await prisma.scheduledJob.create({
          data: {
            projectId: ctx.projectId,
            agentId: targetAgent,
            kind: parsed.kind === 'recurring' ? 'recurring' : (effectiveCardId ? 'reminder' : 'one_shot'),
            cronExpr: parsed.cronExpr || null,
            runAt: parsed.runAt || null,
            nextRunAt,
            prompt,
            title: typeof args.title === 'string' ? args.title : null,
            sessionKey: typeof args.sessionKey === 'string' ? args.sessionKey : null,
            cardId: effectiveCardId,
            payload: deliveryPayload as any,
          },
          select: { id: true, nextRunAt: true, kind: true, cronExpr: true, title: true },
        });
        return {
          ok: true,
          data: {
            id: job.id,
            nextRunAt: job.nextRunAt.toISOString(),
            kind: job.kind,
            cronExpr: job.cronExpr,
            title: job.title,
            message: `Scheduled. Will fire at ${job.nextRunAt.toISOString()}${job.cronExpr ? ` and on cron ${job.cronExpr}` : ''}.`,
          },
        };
      },
    },
    {
      name: 'list_scheduled_tasks',
      description: 'List scheduled tasks on the current project. Optionally filter by cardId or upcoming window.',
      parameters: {
        type: 'object',
        properties: {
          cardId: { type: 'string' },
          includeDisabled: { type: 'boolean' },
        },
      },
      requires: 'scheduler',
      handler: async (ctx, args) => {
        if (!ctx.projectId) return { ok: false, error: 'project required' };
        const rows = await prisma.scheduledJob.findMany({
          where: {
            projectId: ctx.projectId,
            ...(args.cardId ? { cardId: String(args.cardId) } : {}),
            ...(args.includeDisabled ? {} : { enabled: true }),
          },
          orderBy: { nextRunAt: 'asc' },
          take: 50,
          select: { id: true, title: true, prompt: true, kind: true, cronExpr: true, nextRunAt: true, cardId: true, runCount: true, agentId: true, enabled: true },
        });
        return {
          ok: true,
          data: rows.map((r: any) => ({
            ...r,
            nextRunAt: r.nextRunAt.toISOString(),
            promptPreview: (r.prompt || '').slice(0, 200),
          })),
        };
      },
    },
    {
      name: 'cancel_scheduled_task',
      description: 'Cancel a scheduled task by id.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
      requires: 'scheduler',
      handler: async (ctx, args) => {
        if (!ctx.projectId) return { ok: false, error: 'project required' };
        const row = await prisma.scheduledJob.findUnique({ where: { id: String(args.id) } });
        if (!row || row.projectId !== ctx.projectId) return { ok: false, error: 'Not found' };
        await prisma.scheduledJob.update({ where: { id: row.id }, data: { enabled: false } });
        return { ok: true, data: { id: row.id, cancelled: true } };
      },
    },
  ],
};
