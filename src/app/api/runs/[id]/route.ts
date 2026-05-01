import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';
import { isProjectMember } from '@/lib/coding/access';
import { cancelWorkflowRunsForBranch } from '@/lib/coding/githubApp';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user as any;
  const { id } = await params;

  const run = await prisma.agentTaskRun.findUnique({ where: { id } });
  if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!(await isProjectMember(run.projectId, user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  return NextResponse.json(run);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user as any;
  const { id } = await params;

  const run = await prisma.agentTaskRun.findUnique({ where: { id } });
  if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!(await isProjectMember(run.projectId, user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { status } = await request.json();
  if (status !== 'cancelled') return NextResponse.json({ error: 'Only cancellation is supported here' }, { status: 400 });
  if (['completed', 'failed', 'merged', 'cancelled'].includes(run.status)) {
    return NextResponse.json({ error: `Run already terminal (${run.status})` }, { status: 409 });
  }

  const updated = await prisma.agentTaskRun.update({
    where: { id },
    data: { status: 'cancelled', finishedAt: new Date(), errorMessage: `cancelled by ${user.name || user.id}` },
  });
  await prisma.card.updateMany({ where: { id: run.cardId, activeRunId: id }, data: { activeRunId: null } });

  // Best-effort: cancel any in-flight GitHub Actions runs targeting our branch.
  if (run.executionMode === 'github_actions' && run.branchName) {
    const cfg = await prisma.projectCodeConfig.findUnique({ where: { projectId: run.projectId } });
    if (cfg?.ghInstallationId && cfg.repoFullName) {
      cancelWorkflowRunsForBranch({
        installationId: cfg.ghInstallationId,
        repoFullName: cfg.repoFullName,
        branch: run.branchName,
      }).catch((err) => console.error('[cancelWorkflowRuns]', err?.message || err));
    }
  }

  return NextResponse.json(updated);
}
