import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const checklists = await prisma.checklist.findMany({
    where: { cardId: id },
    orderBy: { position: 'asc' },
    include: { items: { orderBy: { position: 'asc' } } },
  });
  return NextResponse.json(checklists);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const user = session.user as any;
  const { title } = await request.json();
  const maxPos = await prisma.checklist.aggregate({ where: { cardId: id }, _max: { position: true } });
  const checklist = await prisma.checklist.create({
    data: {
      cardId: id,
      title: title?.trim() || 'Checklist',
      position: (maxPos._max.position ?? -1) + 1,
    },
    include: { items: true },
  });

  await prisma.cardActivity.create({
    data: {
      cardId: id, type: 'checklist_added',
      content: `added ${checklist.title} to this card`,
      actorId: user.id, actorType: 'user',
    },
  });

  return NextResponse.json(checklist, { status: 201 });
}
