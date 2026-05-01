import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { verifyAgentAccess } from '@/lib/agentHarness';
import { runAgent } from '@/lib/agentRunner';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const access = await verifyAgentAccess(id, (session.user as any).id);
  if (!access.ok) return NextResponse.json({ error: 'Forbidden' }, { status: access.status });

  const body = await req.json();
  if (!body.prompt?.trim()) return NextResponse.json({ error: 'prompt required' }, { status: 400 });

  try {
    const result = await runAgent({
      agentId: id,
      userPrompt: body.prompt,
      maxTokens: body.maxTokens,
      extraContext: body.context,
      enableTools: body.enableTools,
      maxToolRounds: body.maxToolRounds,
      harnessContext: { kind: 'manual' },
    });
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'run failed' }, { status: 500 });
  }
}
