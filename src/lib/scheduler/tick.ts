// Shared cron-tick core. Called from the HTTP route (prod via Vercel Cron,
// curl, etc.) AND from the in-process dev interval in src/instrumentation.ts.
// Idempotent and safe to run every ~30s.

import prisma from '../db';
import { runAgent, summarizeToolResults } from '../agentRunner';
import { nextCronMatch } from './cronNext';
import { sendMessage as matrixSendMessage } from '../matrix';
import { tryDecrypt } from '../crypto';

function matchesCron(expr: string, d: Date): boolean {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const fields = [d.getMinutes(), d.getHours(), d.getDate(), d.getMonth() + 1, d.getDay()];
  for (let i = 0; i < 5; i++) {
    const p = parts[i];
    if (p === '*') continue;
    const step = /^\*\/(\d+)$/.exec(p);
    if (step) {
      const n = parseInt(step[1], 10);
      if (n > 0 && fields[i] % n === 0) continue;
      return false;
    }
    const vals = p.split(',').map((x) => parseInt(x, 10));
    if (!vals.includes(fields[i])) return false;
  }
  return true;
}

export async function runTick(): Promise<{ launched: string[]; scheduledFired: string[] }> {
  const now = new Date();
  const launched: string[] = [];
  const scheduledFired: string[] = [];

  // --- Perpetual-agent heartbeats ---
  const perpetual = await prisma.aIAgent.findMany({
    where: { perpetual: true, isActive: true, scheduleCron: { not: null } },
    select: { id: true, scheduleCron: true, projectId: true, name: true },
  });
  for (const a of perpetual) {
    if (!a.scheduleCron || !a.projectId) continue;
    if (!matchesCron(a.scheduleCron, now)) continue;
    const existing = await prisma.agentTaskRun.findFirst({
      where: { agentId: a.id, trigger: 'cron', status: { in: ['queued', 'running'] } },
      select: { id: true },
    });
    if (existing) continue;
    const run = await prisma.agentTaskRun.create({
      data: {
        projectId: a.projectId,
        agentId: a.id,
        triggerKind: 'manual',
        executionMode: 'local_git',
        trigger: 'cron',
        status: 'running',
        taskBrief: `Scheduled tick (${a.scheduleCron}) at ${now.toISOString()}`,
      },
    });
    launched.push(run.id);
    runAgent({
      agentId: a.id,
      runId: run.id,
      userPrompt: `Your scheduled cron tick fired at ${now.toISOString()} (expr "${a.scheduleCron}"). Perform the work your role dictates; if nothing needs doing right now, say so.`,
      enableTools: true,
      harnessContext: { kind: 'cron' },
    })
      .then(async () => { await prisma.agentTaskRun.update({ where: { id: run.id }, data: { status: 'completed', finishedAt: new Date() } }); })
      .catch(async (err) => { await prisma.agentTaskRun.update({ where: { id: run.id }, data: { status: 'failed', errorMessage: err?.message, finishedAt: new Date() } }); });
  }

  // --- Per-task ScheduledJobs ---
  const dueJobs = await prisma.scheduledJob.findMany({
    where: {
      enabled: true,
      nextRunAt: { lte: now },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    take: 50,
  });
  for (const job of dueJobs as any[]) {
    const run = await prisma.agentTaskRun.create({
      data: {
        projectId: job.projectId,
        agentId: job.agentId,
        cardId: job.cardId || null,
        triggerKind: 'manual',
        executionMode: 'local_git',
        trigger: 'cron',
        sessionKey: job.sessionKey || null,
        status: 'running',
        taskBrief: `Scheduled: ${job.title || job.prompt.slice(0, 120)}`,
      },
    });
    scheduledFired.push(run.id);

    let nextAt: Date | null = null;
    if (job.kind === 'recurring' && job.cronExpr) {
      try { nextAt = nextCronMatch(job.cronExpr, now); } catch { nextAt = null; }
    }
    await prisma.scheduledJob.update({
      where: { id: job.id },
      data: {
        lastRunAt: now,
        lastRunId: run.id,
        runCount: { increment: 1 },
        nextRunAt: nextAt || new Date(now.getTime() + 365 * 86400_000),
        enabled: nextAt ? true : false,
      },
    });

    const harnessKind = job.cardId ? 'card' : 'cron';
    const payload = (job.payload || {}) as { matrixRoomId?: string; roomId?: string; replyToCommentId?: string };
    runAgent({
      agentId: job.agentId,
      runId: run.id,
      userPrompt: job.prompt,
      extraContext: job.title
        ? `Scheduled task: "${job.title}". Fired at ${now.toISOString()}.`
        : `Scheduled task fired at ${now.toISOString()}.`,
      enableTools: true,
      harnessContext: { kind: harnessKind, cardId: job.cardId || undefined },
      delivery: {
        cardId: job.cardId || undefined,
        matrixRoomId: payload.matrixRoomId || undefined,
        roomId: payload.roomId || undefined,
        replyToCommentId: payload.replyToCommentId || undefined,
      },
    })
      .then(async (res) => {
        const text = (res.text || '').trim() || (res.toolResults?.length ? summarizeToolResults(res.toolResults) : '');
        await deliverScheduledReply(job, payload, text);
        await prisma.agentTaskRun.update({ where: { id: run.id }, data: { status: 'completed', finishedAt: new Date() } });
      })
      .catch(async (err) => {
        await prisma.agentTaskRun.update({ where: { id: run.id }, data: { status: 'failed', errorMessage: err?.message, finishedAt: new Date() } });
        await deliverScheduledReply(job, payload, `_(scheduled run failed: ${String(err?.message || err).slice(0, 200)})_`).catch(() => {});
      });
  }

  return { launched, scheduledFired };
}

async function deliverScheduledReply(
  job: any,
  payload: { matrixRoomId?: string; roomId?: string; replyToCommentId?: string },
  text: string,
) {
  if (!text) return;
  if (payload.matrixRoomId) {
    try {
      const agent = await prisma.aIAgent.findUnique({
        where: { id: job.agentId },
        select: { matrixAccessToken: true },
      });
      const token = agent?.matrixAccessToken ? tryDecrypt(agent.matrixAccessToken) : null;
      if (token) {
        await matrixSendMessage(payload.matrixRoomId, token, text);
        return;
      }
      console.warn(`[cron] scheduled job ${job.id} has matrixRoomId but agent ${job.agentId} has no decryptable token`);
    } catch (e: any) {
      console.error(`[cron] matrix delivery failed for job ${job.id}:`, e?.message || e);
    }
  }
  if (job.cardId) {
    try {
      await prisma.comment.create({
        data: {
          cardId: job.cardId,
          content: text,
          authorType: 'agent',
          authorId: job.agentId,
          parentCommentId: payload.replyToCommentId || null,
        },
      });
      return;
    } catch (e: any) {
      console.error(`[cron] card-comment delivery failed for job ${job.id}:`, e?.message || e);
    }
  }
  console.log(`[cron] scheduled job ${job.id} produced text with no delivery target: ${text.slice(0, 200)}`);
}
