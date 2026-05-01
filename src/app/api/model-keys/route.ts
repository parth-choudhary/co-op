import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';
import { encrypt } from '@/lib/crypto';

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

  const keys = await prisma.modelKey.findMany({
    where: { projectId },
    select: { id: true, provider: true, label: true, isValid: true, lastUsedAt: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(keys);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user as any;
  const { provider, key, label, projectId } = await request.json();

  if (!provider || !key) return NextResponse.json({ error: 'Provider and key required' }, { status: 400 });
  if (!projectId) return NextResponse.json({ error: 'projectId is required' }, { status: 400 });

  // Verify membership
  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: user.id } },
  });
  if (!membership) return NextResponse.json({ error: 'Not a member' }, { status: 403 });

  const modelKey = await prisma.modelKey.create({
    data: { projectId, provider, keyEncrypted: encrypt(key), label: label || null, isValid: true },
    select: { id: true, provider: true, label: true, isValid: true, createdAt: true },
  });
  return NextResponse.json(modelKey, { status: 201 });
}
