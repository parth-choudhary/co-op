import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user as any;
  const agents = await prisma.aIAgent.findMany({ where: { companyId: user.companyId }, orderBy: { createdAt: 'desc' } });
  return NextResponse.json(agents);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user as any;
  const data = await request.json();
  if (!data.name?.trim() || !data.systemPrompt?.trim()) return NextResponse.json({ error: 'Name and system prompt required' }, { status: 400 });
  const agent = await prisma.aIAgent.create({
    data: {
      companyId: user.companyId, name: data.name.trim(), role: data.role || 'custom',
      roleLabel: data.roleLabel || 'Custom Agent', description: data.description?.trim() || null,
      modelProvider: data.modelProvider || 'anthropic', modelName: data.modelName || 'claude-sonnet-4-20250514',
      systemPrompt: data.systemPrompt, temperature: data.temperature ?? 0.7, tools: data.tools || [],
    },
  });
  return NextResponse.json(agent, { status: 201 });
}
