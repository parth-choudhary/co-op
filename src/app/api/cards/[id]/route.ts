import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';
import { logAgentActivityBulk, getAgentsOnCard } from '@/lib/agentHarness';
import { notifyMentionsInCardText } from '@/lib/notifications';
import { evaluateAndMaybeDispatch } from '@/lib/coding/triggers';

const cardInclude = {
  assigneeUser: { select: { id: true, name: true, avatarUrl: true } },
  assigneeAgent: { select: { id: true, name: true, role: true, avatarUrl: true } },
  members: {
    include: {
      user: { select: { id: true, name: true, avatarUrl: true, email: true } },
      agent: { select: { id: true, name: true, role: true, avatarUrl: true } },
    },
  },
  checklists: {
    orderBy: { position: 'asc' as const },
    include: {
      items: { orderBy: { position: 'asc' as const } },
    },
  },
  attachments: { orderBy: { createdAt: 'desc' as const } },
  subtasks: {
    orderBy: { position: 'asc' as const },
    include: {
      assigneeUser: { select: { id: true, name: true, avatarUrl: true } },
      assigneeAgent: { select: { id: true, name: true, role: true, avatarUrl: true } },
      column: { select: { id: true, name: true, color: true } },
    },
  },
  parent: { select: { id: true, title: true } },
  _count: { select: { comments: true, activities: true, subtasks: true } },
};

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const card = await prisma.card.findUnique({
    where: { id },
    include: cardInclude,
  });
  if (!card) return NextResponse.json({ error: 'Card not found' }, { status: 404 });
  return NextResponse.json(card);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const user = session.user as any;
  const data = await request.json();
  const updateData: any = {};
  if (data.title !== undefined) updateData.title = data.title.trim();
  if (data.description !== undefined) updateData.description = data.description?.trim() || null;
  if (data.priority !== undefined) updateData.priority = data.priority;
  if (data.labels !== undefined) updateData.labels = data.labels;
  if (data.dueDate !== undefined) updateData.dueDate = data.dueDate ? new Date(data.dueDate) : null;
  if (data.coverImage !== undefined) updateData.coverImage = data.coverImage || null;
  if (data.assigneeAgentId !== undefined) {
    updateData.assigneeAgentId = data.assigneeAgentId || null;
    updateData.assigneeType = data.assigneeAgentId ? 'agent' : null;
    if (data.assigneeAgentId) updateData.assigneeUserId = null;
  }
  if (data.assigneeUserId !== undefined) {
    updateData.assigneeUserId = data.assigneeUserId || null;
    updateData.assigneeType = data.assigneeUserId ? 'user' : null;
    if (data.assigneeUserId) updateData.assigneeAgentId = null;
  }

  const before = Object.prototype.hasOwnProperty.call(updateData, 'assigneeAgentId')
    ? await prisma.card.findUnique({ where: { id }, select: { assigneeAgentId: true } })
    : null;

  const card = await prisma.card.update({
    where: { id },
    data: updateData,
    include: cardInclude,
  });

  if (before && card.assigneeAgentId && card.assigneeAgentId !== before.assigneeAgentId) {
    evaluateAndMaybeDispatch({
      kind: 'assignment',
      cardId: id,
      assigneeAgentId: card.assigneeAgentId,
      actorUserId: user.id,
    }).catch((err) => console.error('[trigger:assignment]', err));
  }

  // Log activity for significant changes
  const changes: string[] = [];
  if (data.priority !== undefined) changes.push(`changed priority to ${data.priority}`);
  if (data.dueDate !== undefined) changes.push(data.dueDate ? `set due date` : `removed due date`);
  if (data.labels !== undefined) changes.push(`updated labels`);
  if (changes.length > 0) {
    await prisma.cardActivity.create({
      data: {
        cardId: id,
        type: 'updated',
        content: changes.join(', '),
        actorId: user.id,
        actorType: 'user',
      },
    });
    const agentIds = await getAgentsOnCard(id);
    await logAgentActivityBulk(agentIds, 'card_updated', { cardId: id, title: card.title, changes });
  }

  if (data.description !== undefined && typeof data.description === 'string') {
    await notifyMentionsInCardText({
      cardId: id,
      content: data.description,
      actorName: user.name || 'Someone',
      actorId: user.id,
      kind: 'card_mention',
    });
  }

  return NextResponse.json(card);
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  await prisma.card.delete({ where: { id } });
  return NextResponse.json({ message: 'Deleted' });
}
