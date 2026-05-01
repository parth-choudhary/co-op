import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { verifyAgentAccess } from '@/lib/agentHarness';
import { executeAction, type AgentAction } from '@/lib/agentActions';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const access = await verifyAgentAccess(id, (session.user as any).id);
  if (!access.ok) return NextResponse.json({ error: 'Forbidden' }, { status: access.status });

  const body = await req.json();

  const actions: AgentAction[] = Array.isArray(body) ? body : body.actions ? body.actions : [body];

  if (actions.length === 0) return NextResponse.json({ error: 'No actions provided' }, { status: 400 });
  if (actions.length > 20) return NextResponse.json({ error: 'Max 20 actions per request' }, { status: 400 });

  const results = [];
  for (const action of actions) {
    if (!action.type) {
      results.push({ ok: false, error: 'Missing action type' });
      continue;
    }
    try {
      const result = await executeAction(id, action);
      results.push(result);
    } catch (err: any) {
      results.push({ ok: false, error: err.message || 'Action failed' });
    }
  }

  return NextResponse.json(actions.length === 1 ? results[0] : { results });
}
