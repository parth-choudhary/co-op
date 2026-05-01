import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';
import { verifyAgentAccess, logAgentActivity } from '@/lib/agentHarness';
import { embedText, toVectorLiteral } from '@/lib/embeddings';

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
  // Best-effort embedding write. Falls through silently when OPENAI_API_KEY is
  // unset or the embedding call fails — the column stays NULL and compileHarness
  // falls back to the non-vector load path. We use $executeRaw because Prisma
  // can't bind Unsupported("vector(1536)") through normal upsert/update.
  const vec = await embedText(content);
  if (vec) {
    await prisma.$executeRaw`UPDATE "AgentMemory" SET "embedding" = ${toVectorLiteral(vec)}::vector WHERE "id" = ${memory.id}`;
  }
  await logAgentActivity(id, 'memory_written', { key, kind, source, embedded: !!vec });
  return NextResponse.json(memory);
}
