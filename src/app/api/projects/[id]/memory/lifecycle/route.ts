import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';
import { dedupProjectMemory } from '@/lib/memoryLifecycle';

// POST /api/projects/[id]/memory/lifecycle — manual trigger for project-tier
// dedup. No stale pass: ProjectMemory has no kind='context' (only decision /
// glossary / convention / fact), and those don't decay on a 90-day cadence.
// Returns the dedup result so the future audit UI can show what happened.

async function assertMember(projectId: string, userId: string) {
  const m = await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } } });
  return !!m;
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user as any;
  const { id: projectId } = await params;
  if (!(await assertMember(projectId, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const dedup = await dedupProjectMemory(projectId);
  return NextResponse.json({ dedup });
}
