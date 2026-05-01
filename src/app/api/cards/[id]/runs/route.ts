import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';
import { projectIdForCard, isProjectMember } from '@/lib/coding/access';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user as any;
  const { id } = await params;

  const projectId = await projectIdForCard(id);
  if (!projectId) return NextResponse.json({ error: 'Card not found' }, { status: 404 });
  if (!(await isProjectMember(projectId, user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const runs = await prisma.agentTaskRun.findMany({
    where: { cardId: id },
    orderBy: { startedAt: 'desc' },
    take: 20,
  });
  return NextResponse.json({ runs });
}
