import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { verifyBriefToken } from '@/lib/coding/githubApp';

// Public, token-gated. No user session — the GitHub Actions runner fetches this.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = request.nextUrl.searchParams.get('token');
  if (!token || !verifyBriefToken(token, id)) {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
  }

  const run = await prisma.agentTaskRun.findUnique({ where: { id }, select: { taskBrief: true, status: true } });
  if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!run.taskBrief) return NextResponse.json({ error: 'Brief not yet compiled' }, { status: 409 });

  // Advance status on first fetch — signals the runner has claimed the job.
  if (run.status === 'dispatched') {
    await prisma.agentTaskRun.update({ where: { id }, data: { status: 'running' } });
  }

  return new NextResponse(run.taskBrief, {
    status: 200,
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
}
