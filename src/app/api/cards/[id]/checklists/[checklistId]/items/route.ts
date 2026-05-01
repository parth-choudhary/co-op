import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; checklistId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { checklistId } = await params;
  const { content } = await request.json();
  if (!content?.trim()) return NextResponse.json({ error: 'Content required' }, { status: 400 });
  const maxPos = await prisma.checklistItem.aggregate({ where: { checklistId }, _max: { position: true } });
  const item = await prisma.checklistItem.create({
    data: {
      checklistId,
      content: content.trim(),
      position: (maxPos._max.position ?? -1) + 1,
    },
  });
  return NextResponse.json(item, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { itemId, content, isChecked } = await request.json();
  if (!itemId) return NextResponse.json({ error: 'itemId required' }, { status: 400 });
  const updateData: any = {};
  if (content !== undefined) updateData.content = content.trim();
  if (isChecked !== undefined) updateData.isChecked = isChecked;
  const item = await prisma.checklistItem.update({ where: { id: itemId }, data: updateData });
  return NextResponse.json(item);
}

export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { itemId } = await request.json();
  if (!itemId) return NextResponse.json({ error: 'itemId required' }, { status: 400 });
  await prisma.checklistItem.delete({ where: { id: itemId } });
  return NextResponse.json({ message: 'Deleted' });
}
