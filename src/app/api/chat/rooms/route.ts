import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';
import { createMatrixRoom } from '@/lib/matrix';

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user as any;

  const projectId = request.nextUrl.searchParams.get('projectId');
  if (!projectId) return NextResponse.json({ error: 'projectId is required' }, { status: 400 });

  // Verify membership
  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: user.id } },
  });
  if (!membership) return NextResponse.json({ error: 'Not a member' }, { status: 403 });

  // Get project (for main project room)
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, color: true, matrixRoomId: true },
  });

  // Get project channels (kind='channel' visible to all project members)
  const channels = await prisma.chatChannel.findMany({
    where: { projectId, kind: 'channel' },
    select: { id: true, name: true, matrixRoomId: true, kind: true },
    orderBy: { createdAt: 'asc' },
  });

  // Get DMs the current user participates in
  const dmChannels = await prisma.chatChannel.findMany({
    where: {
      projectId,
      kind: 'dm',
      members: { some: { userId: user.id } },
    },
    include: {
      members: {
        include: {
          user: { select: { id: true, name: true, email: true, avatarUrl: true } },
          agent: { select: { id: true, name: true, avatarUrl: true } },
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
  });
  const dms = dmChannels.map((c: any) => {
    const other = c.members.find((m: any) => m.userId !== user.id);
    return {
      id: c.id,
      name: c.name,
      matrixRoomId: c.matrixRoomId,
      kind: 'dm' as const,
      counterpart: other
        ? (other.agent
            ? { kind: 'agent' as const, id: other.agent.id, name: other.agent.name, avatarUrl: other.agent.avatarUrl }
            : other.user
              ? { kind: 'user' as const, id: other.user.id, name: other.user.name, avatarUrl: other.user.avatarUrl }
              : null)
        : null,
    };
  });

  // Get project members (users + agents)
  const members = await prisma.projectMember.findMany({
    where: { projectId },
    include: { user: { select: { id: true, name: true, avatarUrl: true, matrixUserId: true } } },
  });
  const agents = await prisma.aIAgent.findMany({
    where: { projectId },
    select: { id: true, name: true, matrixUserId: true },
  });

  const users = members.map((m: any) => ({ ...m.user, type: 'user' as const }));
  const agentList = agents.map((a: any) => ({ ...a, type: 'agent' as const }));

  return NextResponse.json({ project, channels, dms, users, agents: agentList });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user as any;
  const { type, projectId, name } = await request.json();

  if (!projectId) return NextResponse.json({ error: 'projectId is required' }, { status: 400 });

  // Verify membership
  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: user.id } },
  });
  if (!membership) return NextResponse.json({ error: 'Not a member' }, { status: 403 });

  try {
    if (type === 'project') {
      // Create/update main project room
      const project = await prisma.project.findUnique({ where: { id: projectId } });
      if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      if (project.matrixRoomId) return NextResponse.json({ error: 'Project already has a room' }, { status: 400 });

      const room = await createMatrixRoom(project.name, `Chat for ${project.name}`);
      await prisma.project.update({ where: { id: projectId }, data: { matrixRoomId: room.room_id } });
      return NextResponse.json({ roomId: room.room_id }, { status: 201 });
    }

    if (type === 'channel') {
      const channelName = (name || '').trim();
      if (!channelName) return NextResponse.json({ error: 'Channel name is required' }, { status: 400 });

      let matrixRoomId: string | null = null;
      try {
        const room = await createMatrixRoom(channelName);
        matrixRoomId = room.room_id;
      } catch {
        // Matrix may be offline
      }

      const channel = await prisma.chatChannel.create({
        data: {
          projectId,
          name: channelName,
          matrixRoomId,
          createdById: user.id,
        },
      });

      return NextResponse.json({ channel }, { status: 201 });
    }

    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed to create room' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user as any;
  if (user.role !== 'admin') return NextResponse.json({ error: 'Admin role required' }, { status: 403 });

  const channelId = request.nextUrl.searchParams.get('channelId');
  if (!channelId) return NextResponse.json({ error: 'channelId is required' }, { status: 400 });

  const channel = await prisma.chatChannel.findUnique({
    where: { id: channelId },
    include: { project: { select: { companyId: true } } },
  });
  if (!channel) return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
  if (channel.project.companyId !== user.companyId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (channel.kind === 'dm') {
    return NextResponse.json({ error: 'DMs cannot be deleted this way' }, { status: 400 });
  }

  await prisma.chatChannel.delete({ where: { id: channelId } });
  return NextResponse.json({ ok: true });
}
