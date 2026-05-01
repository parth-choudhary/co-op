import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: projectId } = await params;
  const user = session.user as any;

  // Verify caller is a member
  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: user.id } },
  });
  if (!membership) return NextResponse.json({ error: 'Not a member' }, { status: 403 });

  const members = await prisma.projectMember.findMany({
    where: { projectId },
    include: { user: { select: { id: true, name: true, email: true, avatarUrl: true, role: true } } },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json(members);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: projectId } = await params;
  const user = session.user as any;

  // Verify caller is owner or admin
  const callerMembership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: user.id } },
  });
  if (!callerMembership || !['owner', 'admin'].includes(callerMembership.role)) {
    return NextResponse.json({ error: 'Only owners and admins can invite members' }, { status: 403 });
  }

  const { email, role } = await req.json();
  if (!email?.trim()) return NextResponse.json({ error: 'Email is required' }, { status: 400 });

  // Find user by email
  const targetUser = await prisma.user.findUnique({ where: { email: email.trim() } });
  if (!targetUser) return NextResponse.json({ error: 'User not found. They need a Co-Op account first.' }, { status: 404 });

  // Check if already a member
  const existing = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: targetUser.id } },
  });
  if (existing) return NextResponse.json({ error: 'User is already a member of this project' }, { status: 409 });

  const member = await prisma.projectMember.create({
    data: { projectId, userId: targetUser.id, role: role || 'member' },
    include: { user: { select: { id: true, name: true, email: true, avatarUrl: true, role: true } } },
  });

  return NextResponse.json(member, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: projectId } = await params;
  const user = session.user as any;

  const { userId: targetUserId } = await req.json();
  if (!targetUserId) return NextResponse.json({ error: 'userId is required' }, { status: 400 });

  // Verify caller is owner or admin
  const callerMembership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: user.id } },
  });
  if (!callerMembership || !['owner', 'admin'].includes(callerMembership.role)) {
    return NextResponse.json({ error: 'Only owners and admins can remove members' }, { status: 403 });
  }

  // Can't remove the owner
  const targetMembership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: targetUserId } },
  });
  if (!targetMembership) return NextResponse.json({ error: 'User is not a member' }, { status: 404 });
  if (targetMembership.role === 'owner') return NextResponse.json({ error: 'Cannot remove the project owner' }, { status: 403 });

  await prisma.projectMember.delete({
    where: { projectId_userId: { projectId, userId: targetUserId } },
  });

  return NextResponse.json({ success: true });
}
