import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';
import { projectIdForCard, isProjectMember } from '@/lib/coding/access';
import { dispatchRun } from '@/lib/coding/dispatch';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user as any;
  const { id } = await params;

  const projectId = await projectIdForCard(id);
  if (!projectId) return NextResponse.json({ error: 'Card not found' }, { status: 404 });
  if (!(await isProjectMember(projectId, user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const cfg = await prisma.projectCodeConfig.findUnique({ where: { projectId } });
  if (!cfg) return NextResponse.json({ error: 'Code automation not configured for this project' }, { status: 400 });
  if (!cfg.triggerOnManual) return NextResponse.json({ error: 'Manual runs are disabled for this project' }, { status: 400 });

  const card = await prisma.card.findUnique({
    where: { id },
    select: { id: true, title: true, assigneeAgentId: true, activeRunId: true },
  });
  if (!card) return NextResponse.json({ error: 'Card not found' }, { status: 404 });
  if (card.activeRunId) return NextResponse.json({ error: 'A run is already active for this card' }, { status: 409 });
  if (!card.assigneeAgentId) return NextResponse.json({ error: 'Card must be assigned to an agent first' }, { status: 400 });

  const run = await prisma.agentTaskRun.create({
    data: {
      projectId,
      cardId: card.id,
      agentId: card.assigneeAgentId,
      triggerKind: 'manual',
      executionMode: cfg.executionMode,
      status: 'queued',
    },
  });
  await prisma.card.update({ where: { id: card.id }, data: { activeRunId: run.id } });
  await prisma.cardActivity.create({
    data: {
      cardId: card.id, type: 'agent_run_queued',
      content: `queued coding agent (mode: ${cfg.executionMode})`,
      actorId: user.id, actorType: 'user',
    },
  });

  try {
    await dispatchRun(run.id);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Dispatch failed', runId: run.id },
      { status: 502 }
    );
  }

  const dispatched = await prisma.agentTaskRun.findUnique({ where: { id: run.id } });
  return NextResponse.json(dispatched ?? run, { status: 201 });
}
