import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';
import { verifyAgentAccess } from '@/lib/agentHarness';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: agentId } = await params;
  const access = await verifyAgentAccess(agentId, (session.user as any).id);
  if (!access.ok) return NextResponse.json({ error: 'Forbidden' }, { status: access.status });
  const rows = await prisma.agentSubscription.findMany({ where: { agentId }, orderBy: { createdAt: 'desc' } });
  return NextResponse.json({ subscriptions: rows });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: agentId } = await params;
  const access = await verifyAgentAccess(agentId, (session.user as any).id);
  if (!access.ok) return NextResponse.json({ error: 'Forbidden' }, { status: access.status });
  const body = await request.json();
  if (!body.source || !body.sourceRef) return NextResponse.json({ error: 'source and sourceRef required' }, { status: 400 });
  const row = await prisma.agentSubscription.create({
    data: {
      agentId,
      projectId: access.projectId,
      source: String(body.source),
      sourceRef: String(body.sourceRef),
      filter: body.filter ?? null,
      sessionKeyTemplate: body.sessionKeyTemplate ? String(body.sessionKeyTemplate) : null,
      enabled: body.enabled !== false,
    },
  });
  return NextResponse.json({ subscription: row });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: agentId } = await params;
  const access = await verifyAgentAccess(agentId, (session.user as any).id);
  if (!access.ok) return NextResponse.json({ error: 'Forbidden' }, { status: access.status });
  const subId = new URL(request.url).searchParams.get('subscriptionId');
  if (!subId) return NextResponse.json({ error: 'subscriptionId required' }, { status: 400 });
  await prisma.agentSubscription.deleteMany({ where: { id: subId, agentId } });
  return NextResponse.json({ ok: true });
}
