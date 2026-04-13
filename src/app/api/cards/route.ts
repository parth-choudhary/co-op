import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { columnId, title, description, priority } = await request.json();
  if (!columnId || !title?.trim()) return NextResponse.json({ error: 'Column ID and title required' }, { status: 400 });
  const maxPos = await prisma.card.aggregate({ where: { columnId }, _max: { position: true } });
  const card = await prisma.card.create({
    data: {
      columnId, title: title.trim(), description: description?.trim() || null,
      priority: priority || 'medium', position: (maxPos._max.position ?? -1) + 1,
    },
    include: {
      assigneeUser: { select: { id: true, name: true, avatarUrl: true } },
      assigneeAgent: { select: { id: true, name: true, role: true, avatarUrl: true } },
      _count: { select: { comments: true } },
    },
  });
  return NextResponse.json(card, { status: 201 });
}
