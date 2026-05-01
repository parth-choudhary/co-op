import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';
import { derivePrefixFromName } from '@/lib/cardKeys';

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user as any;

  // Return projects where the user is a member
  const memberships = await prisma.projectMember.findMany({
    where: { userId: user.id },
    include: {
      project: {
        include: {
          boards: {
            include: { columns: { include: { _count: { select: { cards: true } } } } },
          },
          _count: { select: { members: true, agents: true, channels: true } },
        },
      },
    },
    orderBy: { project: { updatedAt: 'desc' } },
  });

  const projects = memberships.map((m: any) => ({
    ...m.project,
    role: m.role,
  }));

  return NextResponse.json(projects);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user as any;
  const { name, description, color, defaultAgentShell } = await request.json();
  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

  const project = await prisma.$transaction(async (tx: any) => {
    const proj = await tx.project.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        color: color || '#00d992',
        companyId: user.companyId,
        defaultAgentShell: !!defaultAgentShell,
        cardKeyPrefix: derivePrefixFromName(name.trim()),
      },
    });

    // Auto-create the creator as project owner
    await tx.projectMember.create({
      data: { projectId: proj.id, userId: user.id, role: 'owner' },
    });

    // Create default board with columns
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

  // Fetch the full project with relations
  const fullProject = await prisma.project.findUnique({
    where: { id: project.id },
    include: {
      boards: {
        include: { columns: { include: { _count: { select: { cards: true } } } } },
      },
      _count: { select: { members: true, agents: true, channels: true } },
    },
  });

  return NextResponse.json({ ...fullProject, role: 'owner' }, { status: 201 });
}
