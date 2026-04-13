import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const { columnId, position } = await request.json();
  if (!columnId || position === undefined) return NextResponse.json({ error: 'columnId and position required' }, { status: 400 });
  const card = await prisma.card.findUnique({ where: { id }, select: { columnId: true, position: true } });
  if (!card) return NextResponse.json({ error: 'Card not found' }, { status: 404 });
  const sameColumn = card.columnId === columnId;
  await prisma.$transaction(async (tx: any) => {
    if (sameColumn) {
      const oldPos = card.position;
      if (oldPos < position) {
        await tx.card.updateMany({ where: { columnId, position: { gt: oldPos, lte: position } }, data: { position: { decrement: 1 } } });
      } else if (oldPos > position) {
        await tx.card.updateMany({ where: { columnId, position: { gte: position, lt: oldPos } }, data: { position: { increment: 1 } } });
      }
    } else {
      await tx.card.updateMany({ where: { columnId: card.columnId, position: { gt: card.position } }, data: { position: { decrement: 1 } } });
      await tx.card.updateMany({ where: { columnId, position: { gte: position } }, data: { position: { increment: 1 } } });
    }
    await tx.card.update({ where: { id }, data: { columnId, position } });
  });
  return NextResponse.json({ message: 'Moved' });
}
