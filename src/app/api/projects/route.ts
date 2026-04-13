import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user as any;
  const projects = await prisma.project.findMany({
    where: { companyId: user.companyId },
    include: {
      boards: {
        include: { columns: { include: { _count: { select: { cards: true } } } } },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(projects);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user as any;
  const { name, description, color } = await request.json();
  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  const project = await prisma.$transaction(async (tx: any) => {
    const proj = await tx.project.create({
      data: { name: name.trim(), description: description?.trim() || null, color: color || '#6366f1', companyId: user.companyId },
    });
    const board = await tx.board.create({ data: { name: 'Main Board', projectId: proj.id } });
    await tx.column.createMany({
      data: [
        { name: 'To Do', position: 0, color: '#6b7280', boardId: board.id },
        { name: 'In Progress', position: 1, color: '#3b82f6', boardId: board.id },
        { name: 'Review', position: 2, color: '#f59e0b', boardId: board.id },
        { name: 'Done', position: 3, color: '#22c55e', boardId: board.id },
      ],
    });
    return proj;
  });
  return NextResponse.json(project, { status: 201 });
}
