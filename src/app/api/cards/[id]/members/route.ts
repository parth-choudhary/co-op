import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';
import { logAgentActivity } from '@/lib/agentHarness';
import { notifyCardMemberAdded } from '@/lib/notifications';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const members = await prisma.cardMember.findMany({
    where: { cardId: id },
    include: {
      user: { select: { id: true, name: true, avatarUrl: true, email: true } },
      agent: { select: { id: true, name: true, role: true, avatarUrl: true } },
    },
  });
  return NextResponse.json(members);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const user = session.user as any;
  const { userId, agentId } = await request.json();
  if (!userId && !agentId) return NextResponse.json({ error: 'userId or agentId required' }, { status: 400 });

  try {
    const member = await prisma.cardMember.create({
      data: { cardId: id, userId: userId || null, agentId: agentId || null },
      include: {
        user: { select: { id: true, name: true, avatarUrl: true, email: true } },
        agent: { select: { id: true, name: true, role: true, avatarUrl: true } },
      },
    });

    const memberName = member.user?.name || member.agent?.name || 'Someone';
    await prisma.cardActivity.create({
      data: {
        cardId: id, type: 'member_added',
        content: `added ${memberName} to this card`,
        actorId: user.id, actorType: 'user',
      },
    });

    if (member.agentId) {
      const card = await prisma.card.findUnique({ where: { id }, select: { title: true } });
      await logAgentActivity(member.agentId, 'card_assigned', { cardId: id, title: card?.title, addedBy: user.name });
    }
    if (member.userId) {
      await notifyCardMemberAdded({ cardId: id, userId: member.userId, actorName: user.name, actorId: user.id });
    }

    return NextResponse.json(member, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Member already exists' }, { status: 409 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const user = session.user as any;
  const { memberId } = await request.json();
  if (!memberId) return NextResponse.json({ error: 'memberId required' }, { status: 400 });

  const member = await prisma.cardMember.findUnique({
    where: { id: memberId },
    include: {
      user: { select: { name: true } },
      agent: { select: { name: true } },
    },
  });
  if (!member) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.cardMember.delete({ where: { id: memberId } });

  const memberName = member.user?.name || member.agent?.name || 'Someone';
  await prisma.cardActivity.create({
    data: {
      cardId: id, type: 'member_removed',
      content: `removed ${memberName} from this card`,
      actorId: user.id, actorType: 'user',
    },
  });

  if (member.agentId) {
    const card = await prisma.card.findUnique({ where: { id }, select: { title: true } });
    await logAgentActivity(member.agentId, 'card_unassigned', { cardId: id, title: card?.title, removedBy: user.name });
  }

  return NextResponse.json({ message: 'Removed' });
}
