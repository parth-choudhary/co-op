import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';
import { verifyAgentAccess, compileHarness, logAgentActivity } from '@/lib/agentHarness';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const access = await verifyAgentAccess(id, (session.user as any).id);
  if (!access.ok) return NextResponse.json({ error: 'Forbidden' }, { status: access.status });

  const mode = req.nextUrl.searchParams.get('mode');
  if (mode === 'compiled') {
    const compiled = await compileHarness(id);
    return NextResponse.json({ compiled });
  }
  const snapshot = await prisma.agentContextSnapshot.findUnique({ where: { agentId: id } });
  return NextResponse.json(snapshot || { agentId: id, content: '', stale: true, updatedAt: null });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const access = await verifyAgentAccess(id, (session.user as any).id);
  if (!access.ok) return NextResponse.json({ error: 'Forbidden' }, { status: access.status });
  const { content, stale = false } = await req.json();
  const snapshot = await prisma.agentContextSnapshot.upsert({
    where: { agentId: id },
    create: { agentId: id, content: String(content || ''), stale: Boolean(stale) },
    update: { content: String(content || ''), stale: Boolean(stale) },
  });
  await logAgentActivity(id, 'context_rewritten', { length: snapshot.content.length });
  return NextResponse.json(snapshot);
}
