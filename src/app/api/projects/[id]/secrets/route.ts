import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';
import { encrypt } from '@/lib/crypto';

async function assertMember(projectId: string, userId: string) {
  const m = await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } } });
  return !!m;
}

const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user as any;
  const { id: projectId } = await params;
  if (!(await assertMember(projectId, user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const rows = await prisma.projectSecret.findMany({
    where: { projectId },
    select: { id: true, key: true, mountAs: true, mountPath: true, description: true, updatedAt: true },
    orderBy: { key: 'asc' },
  });
  return NextResponse.json({ secrets: rows });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user as any;
  const { id: projectId } = await params;
  if (!(await assertMember(projectId, user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = await request.json();
  const key = String(body.key || '').trim();
  const value = String(body.value || '');
  const mountAs = body.mountAs === 'file' ? 'file' : 'env';
  const mountPath = mountAs === 'file' ? String(body.mountPath || '').trim() : null;
  if (!KEY_RE.test(key)) return NextResponse.json({ error: 'Invalid key. Use ENV_STYLE_NAMES.' }, { status: 400 });
  if (!value) return NextResponse.json({ error: 'Value is required' }, { status: 400 });
  if (mountAs === 'file' && !mountPath) return NextResponse.json({ error: 'mountPath required for file mount' }, { status: 400 });
  const saved = await prisma.projectSecret.upsert({
    where: { projectId_key: { projectId, key } },
    create: { projectId, key, valueEncrypted: encrypt(value), mountAs, mountPath, description: body.description ?? null },
    update: { valueEncrypted: encrypt(value), mountAs, mountPath, description: body.description ?? null },
    select: { id: true, key: true, mountAs: true, mountPath: true, description: true },
  });
  return NextResponse.json({ secret: saved });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user as any;
  const { id: projectId } = await params;
  if (!(await assertMember(projectId, user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const key = new URL(request.url).searchParams.get('key');
  if (!key) return NextResponse.json({ error: 'key query param required' }, { status: 400 });
  await prisma.projectSecret.deleteMany({ where: { projectId, key } });
  return NextResponse.json({ ok: true });
}
