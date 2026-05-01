import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';
import { parseWhen, nextCronMatch } from '@/lib/scheduler/cronNext';

async function assertMember(projectId: string, userId: string) {
  const m = await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } } });
  return !!m;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user as any;
  const { id: projectId } = await params;
  if (!(await assertMember(projectId, user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const rows = await prisma.scheduledJob.findMany({
    where: { projectId },
    orderBy: { nextRunAt: 'asc' },
    include: { agent: { select: { id: true, name: true, roleLabel: true } } },
  });
  return NextResponse.json({ schedules: rows });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user as any;
  const { id: projectId } = await params;
  if (!(await assertMember(projectId, user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = await request.json();
  if (!body.agentId || !body.when || !body.prompt) return NextResponse.json({ error: 'agentId, when, prompt required' }, { status: 400 });
  let parsed;
  try { parsed = parseWhen(String(body.when)); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 400 }); }
  const nextRunAt = parsed.kind === 'recurring' ? nextCronMatch(parsed.cronExpr!, new Date()) : parsed.runAt!;
  if (nextRunAt.getTime() <= Date.now()) return NextResponse.json({ error: 'Time is in the past' }, { status: 400 });
  const job = await prisma.scheduledJob.create({
    data: {
      projectId,
      agentId: String(body.agentId),
      kind: parsed.kind === 'recurring' ? 'recurring' : (body.cardId ? 'reminder' : 'one_shot'),
      cronExpr: parsed.cronExpr || null,
      runAt: parsed.runAt || null,
      nextRunAt,
      prompt: String(body.prompt),
      title: body.title ? String(body.title) : null,
      cardId: body.cardId ? String(body.cardId) : null,
      sessionKey: body.sessionKey ? String(body.sessionKey) : null,
      createdById: user.id,
    },
  });
  return NextResponse.json({ schedule: job });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user as any;
  const { id: projectId } = await params;
  if (!(await assertMember(projectId, user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const jobId = new URL(request.url).searchParams.get('id');
  if (!jobId) return NextResponse.json({ error: 'id query param required' }, { status: 400 });
  await prisma.scheduledJob.deleteMany({ where: { id: jobId, projectId } });
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user as any;
  const { id: projectId } = await params;
  if (!(await assertMember(projectId, user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = await request.json();
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const data: any = {};
  if (typeof body.enabled === 'boolean') data.enabled = body.enabled;
  if (typeof body.title === 'string') data.title = body.title;
  if (typeof body.prompt === 'string') data.prompt = body.prompt;
  await prisma.scheduledJob.updateMany({ where: { id: String(body.id), projectId }, data });
  return NextResponse.json({ ok: true });
}
