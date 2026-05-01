import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { loadAgentTemplateBundle } from '@/lib/agentTemplates';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ role: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { role } = await params;
  const { systemPrompt, soulMd } = loadAgentTemplateBundle(role);
  return NextResponse.json({ role, systemPrompt, soulMd });
}
