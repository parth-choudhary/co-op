import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';
import { verifyAgentAccess, logAgentActivity } from '@/lib/agentHarness';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const access = await verifyAgentAccess(id, (session.user as any).id);
  if (!access.ok) return NextResponse.json({ error: 'Forbidden' }, { status: access.status });
  const memories = await prisma.agentMemory.findMany({
    where: { agentId: id },
    orderBy: [{ kind: 'asc' }, { updatedAt: 'desc' }],
  });
  return NextResponse.json(memories);
}

const VALID_KINDS = new Set(['fact', 'preference', 'decision', 'context']);
const VALID_SOURCES = new Set(['chat', 'card', 'manual', 'self']);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const access = await verifyAgentAccess(id, (session.user as any).id);
  if (!access.ok) return NextResponse.json({ error: 'Forbidden' }, { status: access.status });
  const data = await req.json();
  const key = String(data.key || '').trim();
  const content = String(data.content || '').trim();
  if (!key || !content) return NextResponse.json({ error: 'key and content required' }, { status: 400 });
  const kind = VALID_KINDS.has(data.kind) ? data.kind : 'fact';
  const source = VALID_SOURCES.has(data.source) ? data.source : 'manual';
  const memory = await prisma.agentMemory.upsert({
    where: { agentId_key: { agentId: id, key } },
    create: { agentId: id, key, content, kind, source, sourceRef: data.sourceRef || null },
    update: { content, kind, source, sourceRef: data.sourceRef || null },
  });
  await logAgentActivity(id, 'memory_written', { key, kind, source });
  return NextResponse.json(memory);
}
