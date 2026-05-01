import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const { position } = await request.json();
  if (position === undefined) return NextResponse.json({ error: 'Position required' }, { status: 400 });
  const column = await prisma.column.findUnique({ where: { id }, select: { boardId: true, position: true } });
  if (!column) return NextResponse.json({ error: 'Column not found' }, { status: 404 });
  const oldPos = column.position;
  await prisma.$transaction(async (tx: any) => {
    if (oldPos < position) {
      await tx.column.updateMany({ where: { boardId: column.boardId, position: { gt: oldPos, lte: position } }, data: { position: { decrement: 1 } } });
    } else if (oldPos > position) {
      await tx.column.updateMany({ where: { boardId: column.boardId, position: { gte: position, lt: oldPos } }, data: { position: { increment: 1 } } });
    }
    await tx.column.update({ where: { id }, data: { position } });
  });
  return NextResponse.json({ message: 'Moved' });
}
