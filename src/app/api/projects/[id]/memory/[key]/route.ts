import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';
import { embedText, toVectorLiteral } from '@/lib/embeddings';

async function assertMember(projectId: string, userId: string) {
  const m = await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } } });
  return !!m;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; key: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user as any;
  const { id: projectId, key } = await params;
  if (!(await assertMember(projectId, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const memory = await prisma.projectMemory.findUnique({
    where: { projectId_key: { projectId, key: decodeURIComponent(key) } },
  });
  if (!memory) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(memory);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; key: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user as any;
  const { id: projectId, key } = await params;
  if (!(await assertMember(projectId, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const data = await req.json();
  const memory = await prisma.projectMemory.update({
    where: { projectId_key: { projectId, key: decodeURIComponent(key) } },
    data: { content: data.content, kind: data.kind, source: data.source, sourceRef: data.sourceRef },
  });
  // Re-embed only when content was actually included — kind/source/sourceRef
  // edits don't change semantics. Same logic as the agent memory PUT.
  if (typeof data.content === 'string' && data.content.trim()) {
    const vec = await embedText(data.content);
    if (vec) {
      await prisma.$executeRaw`UPDATE "ProjectMemory" SET "embedding" = ${toVectorLiteral(vec)}::vector WHERE "id" = ${memory.id}`;
    }
  }
  return NextResponse.json(memory);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; key: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user as any;
  const { id: projectId, key } = await params;
  if (!(await assertMember(projectId, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  await prisma.projectMemory.delete({
    where: { projectId_key: { projectId, key: decodeURIComponent(key) } },
  });
  return NextResponse.json({ ok: true });
}
