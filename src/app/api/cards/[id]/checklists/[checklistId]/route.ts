import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string; checklistId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { checklistId } = await params;
  const { title } = await request.json();
  const checklist = await prisma.checklist.update({
    where: { id: checklistId },
    data: { title: title?.trim() || 'Checklist' },
    include: { items: { orderBy: { position: 'asc' } } },
  });
  return NextResponse.json(checklist);
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string; checklistId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id, checklistId } = await params;
  const user = session.user as any;
  const checklist = await prisma.checklist.findUnique({ where: { id: checklistId } });
  await prisma.checklist.delete({ where: { id: checklistId } });

  await prisma.cardActivity.create({
    data: {
      cardId: id, type: 'checklist_removed',
      content: `removed ${checklist?.title || 'Checklist'} from this card`,
      actorId: user.id, actorType: 'user',
    },
  });

  return NextResponse.json({ message: 'Deleted' });
}
