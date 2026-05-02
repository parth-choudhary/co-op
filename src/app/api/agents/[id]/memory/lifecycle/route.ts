import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { verifyAgentAccess, logAgentActivity } from '@/lib/agentHarness';
import { dedupAgentMemory, markStaleAgentMemories } from '@/lib/memoryLifecycle';

// POST /api/agents/[id]/memory/lifecycle — manual trigger for dedup + stale.
// No scheduled tick yet (deferred from Phase 3); admins curl this when they
// want to clean up. Returns the operation results so the future audit UI
// (Phase 4) or a simple cron caller can show what happened.

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const access = await verifyAgentAccess(id, (session.user as any).id);
  if (!access.ok) return NextResponse.json({ error: 'Forbidden' }, { status: access.status });

  const dedup = await dedupAgentMemory(id);
  const stale = await markStaleAgentMemories(id);

  // Audit-log the lifecycle run as a single event (separate from individual
  // dedup events — those would flood the activity log).
  await logAgentActivity(id, 'memory_lifecycle_run', {
    dedup: { pairsFound: dedup.pairsFound, rowsMerged: dedup.rowsMerged },
    stale: { marked: stale.marked },
  });

  return NextResponse.json({ dedup, stale });
}
