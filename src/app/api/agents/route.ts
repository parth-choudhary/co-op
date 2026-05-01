import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';
import { registerMatrixUser, loginMatrixUser, generateMatrixPassword, matrixLocalpartFromAgentId, matrixUserIdFor } from '@/lib/matrix';
import { encrypt } from '@/lib/crypto';
import { loadAgentTemplate, loadAgentSoul } from '@/lib/agentTemplates';

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user as any;

  const projectId = request.nextUrl.searchParams.get('projectId');
  if (!projectId) return NextResponse.json({ error: 'projectId is required' }, { status: 400 });

  // Verify membership
  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: user.id } },
  });
  if (!membership) return NextResponse.json({ error: 'Not a member' }, { status: 403 });

  const agents = await prisma.aIAgent.findMany({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(agents);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user as any;
  const data = await request.json();

  if (!data.projectId) return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
  if (!data.name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 });

  const role = (data.role || 'custom').toLowerCase();
  const systemPrompt: string = data.systemPrompt?.trim() || loadAgentTemplate(role);
  if (!systemPrompt) return NextResponse.json({ error: 'System prompt required' }, { status: 400 });
  // Seed SOUL from the role's template if the caller didn't provide one. Empty string → null.
  const soulMd: string | null = (data.soulMd?.trim?.() || loadAgentSoul(role) || '').trim() || null;

  // Verify membership
  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId: data.projectId, userId: user.id } },
  });
  if (!membership) return NextResponse.json({ error: 'Not a member' }, { status: 403 });

  // Inherit project-level shell default unless caller passed an explicit plugins array.
  let plugins: string[] | undefined;
  if (Array.isArray(data.plugins)) {
    plugins = data.plugins;
  } else {
    const project = await prisma.project.findUnique({
      where: { id: data.projectId },
      select: { defaultAgentShell: true },
    });
    plugins = project?.defaultAgentShell ? ['shell'] : undefined;
  }

  const agent = await prisma.aIAgent.create({
    data: {
      projectId: data.projectId,
      name: data.name.trim(),
      role,
      roleLabel: data.roleLabel || 'Custom Agent',
      description: data.description?.trim() || null,
      modelProvider: data.modelProvider || 'anthropic',
      modelName: data.modelName || 'claude-sonnet-4-20250514',
      systemPrompt,
      soulMd,
      soulMdUpdatedAt: soulMd ? new Date() : null,
      temperature: data.temperature ?? 0.7,
      tools: data.tools || [],
      ...(plugins ? { plugins } : {}),
    },
  });

  // Provision Matrix account for the agent (best-effort; don't block creation on Matrix failure)
  try {
    const localpart = matrixLocalpartFromAgentId(agent.id);
    const password = generateMatrixPassword(agent.id);
    await registerMatrixUser(localpart, agent.name, password);
    const login = await loginMatrixUser(localpart, password);
    const matrixUserId = login.user_id || matrixUserIdFor(localpart);
    await prisma.aIAgent.update({
      where: { id: agent.id },
      data: {
        matrixLocalpart: localpart,
        matrixUserId,
        matrixAccessToken: encrypt(login.access_token),
        matrixDeviceId: login.device_id || null,
      },
    });
    (agent as any).matrixUserId = matrixUserId;
    (agent as any).matrixLocalpart = localpart;
  } catch (err) {
    console.error('[agents] Matrix provisioning failed:', err);
  }

  return NextResponse.json(agent, { status: 201 });
}
