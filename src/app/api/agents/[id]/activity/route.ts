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
  const activity = await prisma.agentActivityLog.findMany({
    where: { agentId: id },
    orderBy: { createdAt: 'desc' },
    take,
  });
  return NextResponse.json(activity);
}
