import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';

// Project doctrine = USER.md + AGENTS.md. Inherited by every agent in the project.
// Read: any member. Write: owner/admin only.

async function membership(projectId: string, userId: string) {
  return prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const member = await membership(id, (session.user as any).id);
  if (!member) return NextResponse.json({ error: 'Not a member' }, { status: 403 });

  const project = await prisma.project.findUnique({
    where: { id },
    select: {
      userMd: true, userMdUpdatedAt: true,
      agentsMd: true, agentsMdUpdatedAt: true,
      about: true, aboutUpdatedAt: true,
    },
  });
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({
    ...project,
    canEdit: ['owner', 'admin'].includes(member.role),
  });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const member = await membership(id, (session.user as any).id);
  if (!member || !['owner', 'admin'].includes(member.role)) {
    return NextResponse.json({ error: 'Only owners and admins can edit project doctrine' }, { status: 403 });
  }

  const data = await req.json();
  const update: any = {};
  if (data.userMd !== undefined) {
    update.userMd = (data.userMd || '').toString().trim() || null;
    update.userMdUpdatedAt = new Date();
  }
  if (data.agentsMd !== undefined) {
    update.agentsMd = (data.agentsMd || '').toString().trim() || null;
    update.agentsMdUpdatedAt = new Date();
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

  const project = await prisma.project.update({
    where: { id },
    data: update,
    select: {
      userMd: true, userMdUpdatedAt: true,
      agentsMd: true, agentsMdUpdatedAt: true,
    },
  });
  return NextResponse.json(project);
}
