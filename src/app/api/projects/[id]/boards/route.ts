import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: projectId } = await params;
  const user = session.user as any;

  // Verify membership
  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: user.id } },
  });
  if (!membership) return NextResponse.json({ error: 'Not a member' }, { status: 403 });

  const boards = await prisma.board.findMany({
    where: { projectId },
    include: {
      columns: {
        include: { _count: { select: { cards: true } } },
        orderBy: { position: 'asc' },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json(boards);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: projectId } = await params;
  const user = session.user as any;

  // Verify membership
  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: user.id } },
  });
  if (!membership) return NextResponse.json({ error: 'Not a member' }, { status: 403 });

  const { name } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

  const board = await prisma.$transaction(async (tx: any) => {
    const b = await tx.board.create({
      data: { name: name.trim(), projectId },
    });
    await tx.column.createMany({
      data: [
        { name: 'To Do', position: 0, color: '#6b7280', boardId: b.id },
        { name: 'In Progress', position: 1, color: '#3b82f6', boardId: b.id },
        { name: 'Review', position: 2, color: '#f59e0b', boardId: b.id },
        { name: 'Done', position: 3, color: '#22c55e', boardId: b.id },
      ],
    });
    return b;
  });

  const fullBoard = await prisma.board.findUnique({
    where: { id: board.id },
    include: {
      columns: {
        include: { _count: { select: { cards: true } } },
        orderBy: { position: 'asc' },
      },
    },
  });

  return NextResponse.json(fullBoard, { status: 201 });
}
