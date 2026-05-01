import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { verifySignature } from '@/lib/coding/workerHmac';

export const runtime = 'nodejs';

type WorkerStatus = 'claimed' | 'running' | 'pushed' | 'pr_opened' | 'failed' | 'no_changes';

interface WorkerEvent {
  runId: string;
  status: WorkerStatus;
  branchName?: string;
  commitSha?: string;
  prNumber?: number;
  prUrl?: string;
  logsUrl?: string;
  errorMessage?: string;
}

const STATUS_MAP: Record<WorkerStatus, string> = {
  claimed: 'dispatched',
  running: 'running',
  pushed: 'running',
  pr_opened: 'pr_opened',
  failed: 'failed',
  no_changes: 'failed',
};

export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (!verifySignature(raw, request.headers.get('x-coop-signature'))) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }
  let event: WorkerEvent;
  try { event = JSON.parse(raw); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!event.runId || !event.status) return NextResponse.json({ error: 'Missing runId or status' }, { status: 400 });

  const run = await prisma.agentTaskRun.findUnique({ where: { id: event.runId } });
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 });

  // Don't undo terminal states the orchestrator has already reached via GitHub webhooks.
  if (['merged', 'cancelled'].includes(run.status)) return NextResponse.json({ ok: true, ignored: 'terminal' });

  const data: any = {};
  const target = STATUS_MAP[event.status];
  if (target && target !== run.status) data.status = target;
  if (event.branchName && event.branchName !== run.branchName) data.branchName = event.branchName;
  if (event.commitSha) data.commitSha = event.commitSha;
  if (event.prNumber) data.prNumber = event.prNumber;
  if (event.prUrl) data.prUrl = event.prUrl;
  if (event.logsUrl) data.logsUrl = event.logsUrl;
  if (event.errorMessage) data.errorMessage = event.errorMessage.slice(0, 4000);
  if (event.status === 'failed' || event.status === 'no_changes') data.finishedAt = new Date();

  if (Object.keys(data).length > 0) {
    await prisma.agentTaskRun.update({ where: { id: event.runId }, data });
  }

  if (event.status === 'pr_opened' && event.prUrl) {
    await prisma.card.update({ where: { id: run.cardId }, data: { lastPrUrl: event.prUrl, lastPrStatus: 'open' } });
  }
  if (event.status === 'failed' || event.status === 'no_changes') {
    await prisma.card.updateMany({ where: { id: run.cardId, activeRunId: run.id }, data: { activeRunId: null } });
  }

  return NextResponse.json({ ok: true });
}
