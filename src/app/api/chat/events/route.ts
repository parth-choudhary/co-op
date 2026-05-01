import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';
import { handleChatMessage } from '@/lib/agentRunner';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user as any;
  const body = await req.json();
  const { channelId, matrixRoomId, content, roomName } = body;
  if (!content?.trim()) return NextResponse.json({ error: 'content required' }, { status: 400 });

  let channel = channelId
    ? await prisma.chatChannel.findUnique({ where: { id: channelId } })
    : matrixRoomId
    ? await prisma.chatChannel.findFirst({ where: { matrixRoomId } })
    : null;

  // Fallback: channelId may be the projectId of the project-level default room
  let projectIdForRun: string | null = channel?.projectId || null;
  let roomIdForRun: string | null = channel?.id || null;
  let roomMatrixId: string | null = matrixRoomId || channel?.matrixRoomId || null;
  let roomNameForRun: string | null = roomName || channel?.name || null;

  if (!channel && channelId) {
    const project = await prisma.project.findUnique({ where: { id: channelId }, select: { id: true, name: true, matrixRoomId: true } });
    if (project && project.matrixRoomId) {
      projectIdForRun = project.id;
      roomIdForRun = project.id;
      roomMatrixId = matrixRoomId || project.matrixRoomId;
      roomNameForRun = roomName || project.name;
    }
  }

  if (!projectIdForRun || !roomIdForRun) return NextResponse.json({ error: 'Channel not found' }, { status: 404 });

  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId: projectIdForRun, userId: user.id } },
  });
  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // For DM channels, enforce per-channel membership on top of project membership
  if (channel && channel.kind === 'dm') {
    const dmMember = await prisma.chatChannelMember.findFirst({
      where: { channelId: channel.id, userId: user.id },
    });
    if (!dmMember) return NextResponse.json({ error: 'Not in this DM' }, { status: 403 });
  }

  const result = await handleChatMessage({
    projectId: projectIdForRun,
    roomId: roomIdForRun,
    matrixRoomId: roomMatrixId,
    roomName: roomNameForRun || 'Project',
    sender: user.name || user.email || 'Unknown',
    content,
    postReplies: true,
    inviterToken: body.inviterToken || undefined,
  });

  return NextResponse.json(result);
}
