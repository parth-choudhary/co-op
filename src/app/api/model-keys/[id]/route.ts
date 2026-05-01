import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const user = session.user as any;

  // Verify caller owns a project that has this key
  const key = await prisma.modelKey.findUnique({ where: { id } });
  if (!key || !key.projectId) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId: key.projectId, userId: user.id } },
  });
  if (!membership) return NextResponse.json({ error: 'Not a member' }, { status: 403 });

  await prisma.modelKey.delete({ where: { id } });
  return NextResponse.json({ message: 'Deleted' });
}
