import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const user = session.user as any;

  // Verify membership
  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId: id, userId: user.id } },
  });
  if (!membership) return NextResponse.json({ error: 'Not a member' }, { status: 403 });

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      boards: {
        include: {
          columns: {
            orderBy: { position: 'asc' },
            include: {
              cards: {
                where: { parentCardId: null },
                orderBy: { position: 'asc' },
                include: {
                  assigneeUser: { select: { id: true, name: true, avatarUrl: true } },
                  assigneeAgent: { select: { id: true, name: true, role: true, avatarUrl: true } },
                  members: {
                    include: {
                      user: { select: { id: true, name: true, avatarUrl: true } },
                      agent: { select: { id: true, name: true, role: true } },
                    },
                  },
                  checklists: {
                    include: { items: { select: { id: true, isChecked: true } } },
                  },
                  subtasks: {
                    select: { id: true, column: { select: { name: true } } },
                  },
                  attachments: { select: { id: true } },
                  _count: { select: { comments: true, subtasks: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(project);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const user = session.user as any;

  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId: id, userId: user.id } },
  });
  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return NextResponse.json({ error: 'Only owners and admins can edit projects' }, { status: 403 });
  }

  const data = await request.json();
  const updateData: any = {};
  if (data.name !== undefined) updateData.name = data.name?.trim();
  if (data.description !== undefined) updateData.description = data.description?.trim();
  if (data.color !== undefined) updateData.color = data.color;
  if (data.about !== undefined) {
    updateData.about = (data.about || '').toString();
    updateData.aboutUpdatedAt = new Date();
  }
  // USER.md and AGENTS.md are project-level admin-controlled doctrine
  // inherited by every agent in the project. Already admin-gated above.
  if (data.userMd !== undefined) {
    updateData.userMd = (data.userMd || '').toString().trim() || null;
    updateData.userMdUpdatedAt = new Date();
  }
  if (data.agentsMd !== undefined) {
    updateData.agentsMd = (data.agentsMd || '').toString().trim() || null;
    updateData.agentsMdUpdatedAt = new Date();
  }
  if (data.defaultAgentShell !== undefined) {
    updateData.defaultAgentShell = !!data.defaultAgentShell;
  }
  await prisma.project.update({ where: { id }, data: updateData });
  return NextResponse.json({ message: 'Updated' });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const user = session.user as any;

  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId: id, userId: user.id } },
  });
  if (!membership || membership.role !== 'owner') {
    return NextResponse.json({ error: 'Only the project owner can delete it' }, { status: 403 });
  }

  await prisma.project.delete({ where: { id } });
  return NextResponse.json({ message: 'Deleted' });
}
