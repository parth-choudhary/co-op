import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const data = await request.json();
  const updateData: any = {};
  if (data.title !== undefined) updateData.title = data.title.trim();
  if (data.description !== undefined) updateData.description = data.description?.trim() || null;
  if (data.priority !== undefined) updateData.priority = data.priority;
  if (data.labels !== undefined) updateData.labels = data.labels;
  if (data.dueDate !== undefined) updateData.dueDate = data.dueDate ? new Date(data.dueDate) : null;
  const card = await prisma.card.update({
    where: { id }, data: updateData,
    include: {
      assigneeUser: { select: { id: true, name: true, avatarUrl: true } },
      assigneeAgent: { select: { id: true, name: true, role: true, avatarUrl: true } },
      _count: { select: { comments: true } },
    },
  });
  return NextResponse.json(card);
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  await prisma.card.delete({ where: { id } });
  return NextResponse.json({ message: 'Deleted' });
}
