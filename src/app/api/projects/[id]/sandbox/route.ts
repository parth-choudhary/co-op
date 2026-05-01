import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';
import { encrypt } from '@/lib/crypto';

const BACKENDS = ['local', 'ssh', 'openshell'] as const;

async function assertMember(projectId: string, userId: string) {
  const m = await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } } });
  return !!m;
}

function sanitize(row: any) {
  if (!row) return null;
  const { sshKeyEncrypted, ...rest } = row;
  return { ...rest, hasSshKey: !!sshKeyEncrypted };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user as any;
  const { id: projectId } = await params;
  if (!(await assertMember(projectId, user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const cfg = await prisma.projectSandboxConfig.findUnique({ where: { projectId } });
  return NextResponse.json({ config: sanitize(cfg) });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user as any;
  const { id: projectId } = await params;
  if (!(await assertMember(projectId, user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = await request.json();
  const backend = BACKENDS.includes(body.backend) ? body.backend : 'local';
  if (backend === 'ssh' && !body.sshHost) return NextResponse.json({ error: 'sshHost required for ssh backend' }, { status: 400 });
  const data: any = {
    backend,
    image: body.image?.trim() || 'coop/sandbox-tier1:latest',
    sshHost: body.sshHost?.trim() || null,
    sshUser: body.sshUser?.trim() || null,
    workspaceDir: body.workspaceDir?.trim() || '/workspace',
    policyYaml: body.policyYaml ?? null,
    idleTimeoutSec: Number.isFinite(body.idleTimeoutSec) ? body.idleTimeoutSec : 900,
    maxWallSeconds: Number.isFinite(body.maxWallSeconds) ? body.maxWallSeconds : 300,
    enabled: body.enabled !== false,
  };
  if (typeof body.sshKey === 'string' && body.sshKey.trim()) {
    data.sshKeyEncrypted = encrypt(body.sshKey.trim());
  }
  const saved = await prisma.projectSandboxConfig.upsert({
    where: { projectId },
    create: { projectId, ...data },
    update: data,
  });
  return NextResponse.json({ config: sanitize(saved) });
}
