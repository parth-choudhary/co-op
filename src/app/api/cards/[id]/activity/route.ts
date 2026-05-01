import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const url = new URL(request.url);
  const cursor = url.searchParams.get('cursor');
  const take = 30;

  const activities = await prisma.cardActivity.findMany({
    where: { cardId: id },
    orderBy: { createdAt: 'desc' },
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = activities.length > take;
  if (hasMore) activities.pop();

  return NextResponse.json({ activities, hasMore, nextCursor: hasMore ? activities[activities.length - 1]?.id : null });
}
