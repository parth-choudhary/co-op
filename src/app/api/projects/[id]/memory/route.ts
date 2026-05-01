import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';
import { embedText, toVectorLiteral } from '@/lib/embeddings';

// Project memory tier (Memory v2 / Phase 2). Sibling of /api/agents/[id]/memory
// but scoped by project — every member of the project can read AND write.
// No role gate (any ProjectMember). Cross-project reads/writes are blocked
// by the membership check; tests/compat/project-memory-auth.test.ts locks
// that contract in.

async function assertMember(projectId: string, userId: string) {
  const m = await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } } });
  return !!m;
}

const VALID_KINDS = new Set(['decision', 'glossary', 'convention', 'fact']);
const VALID_SOURCES = new Set(['agent', 'admin', 'manual']);

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user as any;
  const { id: projectId } = await params;
  if (!(await assertMember(projectId, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const memories = await prisma.projectMemory.findMany({
    where: { projectId },
    orderBy: [{ kind: 'asc' }, { updatedAt: 'desc' }],
  });
  return NextResponse.json(memories);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user as any;
  const { id: projectId } = await params;
  if (!(await assertMember(projectId, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const data = await req.json();
  const key = String(data.key || '').trim();
  const content = String(data.content || '').trim();
  if (!key || !content) return NextResponse.json({ error: 'key and content required' }, { status: 400 });
  const kind = VALID_KINDS.has(data.kind) ? data.kind : 'fact';
  // POSTs through this endpoint are human-driven (settings UI / curl) — agents
  // write through the set_project_memory tool which sets writtenBy and source='agent'.
  // Default source here is 'manual' / 'admin'; we don't write writtenBy.
  const source = VALID_SOURCES.has(data.source) ? data.source : 'manual';
  const memory = await prisma.projectMemory.upsert({
    where: { projectId_key: { projectId, key } },
    create: { projectId, key, content, kind, source, sourceRef: data.sourceRef || null, writtenBy: null },
    update: { content, kind, source, sourceRef: data.sourceRef || null, writtenBy: null },
  });
  // Best-effort embedding write — same two-step pattern as agent memory.
  // Falls through silently when OPENAI_API_KEY is unset; the column stays NULL
  // and retrieveProjectMemories falls back to the non-vector load path.
  const vec = await embedText(content);
  if (vec) {
    await prisma.$executeRaw`UPDATE "ProjectMemory" SET "embedding" = ${toVectorLiteral(vec)}::vector WHERE "id" = ${memory.id}`;
  }
  return NextResponse.json(memory);
}
