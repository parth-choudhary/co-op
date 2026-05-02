import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';
import { verifyAgentAccess } from '@/lib/agentHarness';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const access = await verifyAgentAccess(id, (session.user as any).id);
  if (!access.ok) return NextResponse.json({ error: 'Forbidden' }, { status: access.status });

  const take = Math.min(parseInt(req.nextUrl.searchParams.get('limit') || '50', 10), 200);

  // ?type=memory_retrieved or ?type=memory_retrieved,project_memory_retrieved
  // Filters the activity log by event type. The Phase 4 retrievals view passes
  // both retrieved-event types so the audit view shows agent-tier and project-tier
  // pulls in one timeline. When omitted, returns all events (legacy behavior).
  const typeParam = req.nextUrl.searchParams.get('type');
  const types = typeParam ? typeParam.split(',').map((s) => s.trim()).filter(Boolean) : null;

  // ?before=<ISO> — cursor pagination. Returns events strictly before the
  // cursor's createdAt. Omit on the first page; pass the last event's
  // createdAt to fetch the next page.
  const beforeParam = req.nextUrl.searchParams.get('before');
  const before = beforeParam ? new Date(beforeParam) : null;
  const beforeIsValid = before && !Number.isNaN(before.getTime());

  const where: any = { agentId: id };
  if (types && types.length > 0) where.eventType = { in: types };
  if (beforeIsValid) where.createdAt = { lt: before };

  const activity = await prisma.agentActivityLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take,
  });
  return NextResponse.json(activity);
}
