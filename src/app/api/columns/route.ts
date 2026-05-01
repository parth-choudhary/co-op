import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { boardId, name, color } = await request.json();
  if (!boardId || !name?.trim()) return NextResponse.json({ error: 'Board ID and name required' }, { status: 400 });
  const maxPos = await prisma.column.aggregate({ where: { boardId }, _max: { position: true } });
  const column = await prisma.column.create({
    data: {
      boardId,
      name: name.trim(),
      color: color || null,
      position: (maxPos._max.position ?? -1) + 1,
    },
    include: { cards: true },
  });
  return NextResponse.json(column, { status: 201 });
}
