import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';
import { projectMemorySummary } from '@/lib/memoryLifecycle';

// GET /api/projects/[id]/memory/summary
//   { total, embedded, stale, dedupCandidates }

async function assertMember(projectId: string, userId: string) {
  const m = await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } } });
  return !!m;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user as any;
  const { id: projectId } = await params;
  if (!(await assertMember(projectId, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const summary = await projectMemorySummary(projectId);
  return NextResponse.json(summary);
}
