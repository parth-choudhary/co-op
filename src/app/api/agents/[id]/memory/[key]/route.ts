import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';
import { verifyAgentAccess, logAgentActivity } from '@/lib/agentHarness';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; key: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id, key } = await params;
  const access = await verifyAgentAccess(id, (session.user as any).id);
  if (!access.ok) return NextResponse.json({ error: 'Forbidden' }, { status: access.status });
  const memory = await prisma.agentMemory.findUnique({ where: { agentId_key: { agentId: id, key: decodeURIComponent(key) } } });
  if (!memory) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(memory);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; key: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id, key } = await params;
  const access = await verifyAgentAccess(id, (session.user as any).id);
  if (!access.ok) return NextResponse.json({ error: 'Forbidden' }, { status: access.status });
  const data = await req.json();
  const memory = await prisma.agentMemory.update({
    where: { agentId_key: { agentId: id, key: decodeURIComponent(key) } },
    data: { content: data.content, kind: data.kind, source: data.source, sourceRef: data.sourceRef },
  });
  await logAgentActivity(id, 'memory_written', { key: memory.key, kind: memory.kind });
  return NextResponse.json(memory);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; key: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id, key } = await params;
  const access = await verifyAgentAccess(id, (session.user as any).id);
  if (!access.ok) return NextResponse.json({ error: 'Forbidden' }, { status: access.status });
  await prisma.agentMemory.delete({ where: { agentId_key: { agentId: id, key: decodeURIComponent(key) } } });
  return NextResponse.json({ ok: true });
}
