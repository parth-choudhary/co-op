import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';
import { encrypt, tryDecrypt } from '@/lib/crypto';

const VALID_MODES = ['github_actions', 'ssh_devbox', 'local_git'] as const;
const VALID_POLICIES = ['human_pr', 'staging_branch', 'auto_merge'] as const;
const LOCAL_MODE_ENABLED = process.env.COOP_LOCAL_MODE === '1';

async function assertMember(projectId: string, userId: string) {
  const m = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
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

  const cfg = await prisma.projectCodeConfig.findUnique({ where: { projectId } });
  return NextResponse.json({ ...sanitize(cfg), _localModeEnabled: LOCAL_MODE_ENABLED });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user as any;
  const { id: projectId } = await params;
  if (!(await assertMember(projectId, user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  const executionMode = body.executionMode;
  const mergePolicy = body.mergePolicy ?? 'human_pr';
  if (!VALID_MODES.includes(executionMode)) return NextResponse.json({ error: 'Invalid executionMode' }, { status: 400 });
  if (!VALID_POLICIES.includes(mergePolicy)) return NextResponse.json({ error: 'Invalid mergePolicy' }, { status: 400 });

  if (executionMode === 'ssh_devbox' && !body.sshHost) return NextResponse.json({ error: 'sshHost is required for ssh_devbox' }, { status: 400 });
  if (executionMode === 'local_git') {
    if (!LOCAL_MODE_ENABLED) return NextResponse.json({ error: 'Local-git mode is disabled on this deployment. Set COOP_LOCAL_MODE=1.' }, { status: 400 });
    if (!body.localRepoPath || !body.localRepoPath.startsWith('/')) {
      return NextResponse.json({ error: 'localRepoPath must be an absolute path' }, { status: 400 });
    }
  }
  if (mergePolicy === 'staging_branch' && !body.stagingBranch) return NextResponse.json({ error: 'stagingBranch is required for staging_branch policy' }, { status: 400 });

  const data: any = {
    executionMode,
    mergePolicy,
    repoFullName: body.repoFullName?.trim() || null,
    defaultBranch: body.defaultBranch?.trim() || 'main',
    stagingBranch: body.stagingBranch?.trim() || null,
    ghInstallationId: body.ghInstallationId?.trim() || null,
    triggerColumnIds: Array.isArray(body.triggerColumnIds)
      ? body.triggerColumnIds.filter((x: unknown): x is string => typeof x === 'string' && x.length > 0)
      : [],
    triggerOnAssign: !!body.triggerOnAssign,
    triggerOnComment: body.triggerOnComment !== false,
    triggerOnColumnMove: body.triggerOnColumnMove !== false,
    triggerOnManual: body.triggerOnManual !== false,
    sshHost: body.sshHost?.trim() || null,
    sshUser: body.sshUser?.trim() || null,
    localRepoPath: executionMode === 'local_git' ? (body.localRepoPath?.trim() || null) : null,
    pushToRemote: executionMode === 'local_git' && !!body.pushToRemote,
    openPrWithGhCli: executionMode === 'local_git' && !!body.openPrWithGhCli,
    maxTokensPerRun: Number.isFinite(body.maxTokensPerRun) ? body.maxTokensPerRun : 200000,
    maxWallSecondsPerRun: Number.isFinite(body.maxWallSecondsPerRun) ? body.maxWallSecondsPerRun : 1800,
  };

  // Only overwrite the SSH key if a new plaintext value was provided
  if (typeof body.sshKey === 'string' && body.sshKey.trim()) {
    data.sshKeyEncrypted = encrypt(body.sshKey.trim());
  }

  const saved = await prisma.projectCodeConfig.upsert({
    where: { projectId },
    create: { projectId, ...data },
    update: data,
  });

  // Probe decryption to catch env mismatch early
  if (saved.sshKeyEncrypted) tryDecrypt(saved.sshKeyEncrypted);

  return NextResponse.json({ ...sanitize(saved), _localModeEnabled: LOCAL_MODE_ENABLED });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user as any;
  const { id: projectId } = await params;
  if (!(await assertMember(projectId, user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  await prisma.projectCodeConfig.deleteMany({ where: { projectId } });
  return NextResponse.json({ ok: true });
}
