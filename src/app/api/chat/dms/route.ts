import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';
import { createMatrixRoom, inviteUserToRoom, joinRoomAs } from '@/lib/matrix';
import { tryDecrypt } from '@/lib/crypto';

const MATRIX_ADMIN_TOKEN = process.env.MATRIX_ADMIN_TOKEN || '';

// POST body: { projectId, userId?, agentId? }
// Returns the DM ChatChannel row (creates it if it doesn't exist).
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const me = session.user as any;
  const { projectId, userId, agentId } = await request.json();

  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });
  if (!userId && !agentId) return NextResponse.json({ error: 'userId or agentId required' }, { status: 400 });
  if (userId && agentId) return NextResponse.json({ error: 'pass only one of userId/agentId' }, { status: 400 });
  if (userId === me.id) return NextResponse.json({ error: "can't DM yourself" }, { status: 400 });

  // Membership check on project
  const myMembership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: me.id } },
  });
  if (!myMembership) return NextResponse.json({ error: 'Not a project member' }, { status: 403 });

  // If target is user, verify they're also a project member
  if (userId) {
    const theirMembership = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    if (!theirMembership) return NextResponse.json({ error: 'Target user is not in project' }, { status: 403 });
  }
  // If target is agent, verify they're in this project
  let agent: any = null;
  if (agentId) {
    agent = await prisma.aIAgent.findUnique({ where: { id: agentId } });
    if (!agent || agent.projectId !== projectId) return NextResponse.json({ error: 'Agent not in project' }, { status: 403 });
  }

  // Look for existing DM: a kind="dm" channel in this project whose member list is exactly {me, counterpart}
  const existingForMe = await prisma.chatChannel.findMany({
    where: {
      projectId,
      kind: 'dm',
      members: { some: { userId: me.id } },
    },
    include: { members: true },
  });
  const existing = existingForMe.find((c: any) => {
    const m = c.members;
    if (m.length !== 2) return false;
    if (userId) return m.some((x: any) => x.userId === userId);
    if (agentId) return m.some((x: any) => x.agentId === agentId);
    return false;
  });
  if (existing) {
    return NextResponse.json({ channel: { id: existing.id, name: existing.name, kind: existing.kind, matrixRoomId: existing.matrixRoomId } });
  }

  // Create Matrix room. Target name is counterpart's display name.
  let counterpartName = '';
  let counterpartMatrixId: string | null = null;
  if (userId) {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true, matrixUserId: true } });
    counterpartName = u?.name || u?.email || 'user';
    counterpartMatrixId = (u as any)?.matrixUserId || null;
  } else if (agent) {
    counterpartName = agent.name;
    counterpartMatrixId = agent.matrixUserId || null;
  }
  const roomName = `DM: ${me.name || me.email} ↔ ${counterpartName}`;

  let matrixRoomId: string | null = null;
  try {
    const room = await createMatrixRoom(roomName, 'Direct message', counterpartMatrixId ? [counterpartMatrixId] : []);
    matrixRoomId = room.room_id;
  } catch {
    matrixRoomId = null;
  }

  // Invite current user (they're not auto-invited since admin created the room)
  if (matrixRoomId && MATRIX_ADMIN_TOKEN) {
    const myUser = await prisma.user.findUnique({ where: { id: me.id }, select: { matrixUserId: true } });
    if ((myUser as any)?.matrixUserId) {
      try { await inviteUserToRoom(matrixRoomId, (myUser as any).matrixUserId, MATRIX_ADMIN_TOKEN); } catch { /* best-effort */ }
    }
    // Auto-join agent if DM counterpart is an agent
    if (agent?.matrixAccessToken) {
      const token = tryDecrypt(agent.matrixAccessToken);
      if (token) { try { await joinRoomAs(matrixRoomId, token); } catch { /* best-effort */ } }
    }
  }

  const channel = await prisma.chatChannel.create({
    data: {
      projectId,
      name: roomName,
      kind: 'dm',
      matrixRoomId,
      createdById: me.id,
      members: {
        create: [
          { userId: me.id },
          userId ? { userId } : { agentId },
        ],
      },
    },
  });
  return NextResponse.json({ channel: { id: channel.id, name: channel.name, kind: channel.kind, matrixRoomId: channel.matrixRoomId } });
}
