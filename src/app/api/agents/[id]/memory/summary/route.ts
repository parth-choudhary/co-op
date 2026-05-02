import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { verifyAgentAccess } from '@/lib/agentHarness';
import { agentMemorySummary } from '@/lib/memoryLifecycle';

// GET /api/agents/[id]/memory/summary
//   { total, embedded, stale, dedupCandidates }
//
// Read-only. Powers the audit UI (Phase 4) and any cron caller that wants
// to know whether dedup would actually do work before triggering it.

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const access = await verifyAgentAccess(id, (session.user as any).id);
  if (!access.ok) return NextResponse.json({ error: 'Forbidden' }, { status: access.status });

  const summary = await agentMemorySummary(id);
  return NextResponse.json(summary);
}
