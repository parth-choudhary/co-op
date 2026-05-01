import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';
import { assignNextCardNumber, resolveProjectIdForColumn } from '@/lib/cardKeyAssign';

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { columnId, title, description, priority, parentCardId } = await request.json();
  if (!columnId || !title?.trim()) return NextResponse.json({ error: 'Column ID and title required' }, { status: 400 });
  if (parentCardId) {
    const parent = await prisma.card.findUnique({ where: { id: parentCardId }, select: { id: true } });
    if (!parent) return NextResponse.json({ error: 'Parent card not found' }, { status: 400 });
  }
  const projectId = await resolveProjectIdForColumn(columnId);
  if (!projectId) return NextResponse.json({ error: 'Column not found' }, { status: 400 });
  const [maxPos, assigned] = await Promise.all([
    prisma.card.aggregate({ where: { columnId }, _max: { position: true } }),
    assignNextCardNumber(projectId),
  ]);
  const card = await prisma.card.create({
    data: {
      columnId, title: title.trim(), description: description?.trim() || null,
      priority: priority || 'medium', position: (maxPos._max.position ?? -1) + 1,
      parentCardId: parentCardId || null,
      projectId, number: assigned.number,
    },
    include: {
      assigneeUser: { select: { id: true, name: true, avatarUrl: true } },
      assigneeAgent: { select: { id: true, name: true, role: true, avatarUrl: true } },
      members: {
        include: {
          user: { select: { id: true, name: true, avatarUrl: true } },
          agent: { select: { id: true, name: true, role: true } },
        },
      },
      checklists: { include: { items: { select: { id: true, isChecked: true } } } },
      attachments: { select: { id: true } },
      _count: { select: { comments: true } },
    },
  });
  return NextResponse.json(card, { status: 201 });
}
