import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';
import { verifyAgentAccess } from '@/lib/agentHarness';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const access = await verifyAgentAccess(id, (session.user as any).id);
  if (!access.ok) return NextResponse.json({ error: 'Forbidden' }, { status: access.status });
  const agent = await prisma.aIAgent.findUnique({ where: { id } });
  return NextResponse.json(agent);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const access = await verifyAgentAccess(id, (session.user as any).id);
  if (!access.ok) return NextResponse.json({ error: 'Forbidden' }, { status: access.status });
  const data = await req.json();
  const update: any = {};
  if (data.name !== undefined) update.name = data.name?.trim();
  if (data.description !== undefined) update.description = data.description?.trim() || null;
  if (data.systemPrompt !== undefined) update.systemPrompt = data.systemPrompt;
  if (data.soulMd !== undefined) {
    update.soulMd = data.soulMd?.toString().trim() || null;
    update.soulMdUpdatedAt = new Date();
  }
  if (data.temperature !== undefined) update.temperature = data.temperature;
  if (data.modelProvider !== undefined) update.modelProvider = data.modelProvider;
  if (data.modelName !== undefined) update.modelName = data.modelName;
  if (data.isActive !== undefined) update.isActive = data.isActive;
  if (Array.isArray(data.plugins)) update.plugins = data.plugins.filter((x: any) => typeof x === 'string');
  if (Array.isArray(data.skills)) update.skills = data.skills.filter((x: any) => typeof x === 'string');
  if (data.perpetual !== undefined) update.perpetual = !!data.perpetual;
  if (data.scheduleCron !== undefined) update.scheduleCron = data.scheduleCron?.trim() || null;
  const agent = await prisma.aIAgent.update({ where: { id }, data: update });
  return NextResponse.json(agent);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const access = await verifyAgentAccess(id, (session.user as any).id);
  if (!access.ok) return NextResponse.json({ error: 'Forbidden' }, { status: access.status });
  await prisma.aIAgent.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
