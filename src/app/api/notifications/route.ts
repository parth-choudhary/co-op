import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user as any;

  const url = new URL(request.url);
  const unreadOnly = url.searchParams.get('unread') === '1';
  const countOnly = url.searchParams.get('countOnly') === '1';

  // Guard: prisma.notification is only available after `prisma generate` has been
  // re-run against the new schema + migration applied. Return empty state rather
  // than 500-spamming the logs when the platform is still mid-update.
  const model: any = (prisma as any).notification;
  if (!model) {
    return NextResponse.json({ notifications: [], unreadCount: 0, pending: true });
  }

  try {
    const unreadCount = await model.count({ where: { userId: user.id, read: false } });
    if (countOnly) return NextResponse.json({ unreadCount });

    const notifications = await model.findMany({
      where: unreadOnly ? { userId: user.id, read: false } : { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return NextResponse.json({ notifications, unreadCount });
  } catch (e: any) {
    // Table may not exist yet if migration hasn't been deployed.
    if (/does not exist|relation .* does not exist/i.test(e?.message || '')) {
      return NextResponse.json({ notifications: [], unreadCount: 0, pending: true });
    }
    throw e;
  }
}

export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user as any;
  const { ids, all } = await request.json().catch(() => ({ ids: [], all: false }));

  const model: any = (prisma as any).notification;
  if (!model) return NextResponse.json({ ok: true, pending: true });

  try {
    if (all) {
      await model.updateMany({ where: { userId: user.id, read: false }, data: { read: true } });
      return NextResponse.json({ ok: true });
    }
    if (Array.isArray(ids) && ids.length > 0) {
      await model.updateMany({ where: { userId: user.id, id: { in: ids } }, data: { read: true } });
      return NextResponse.json({ ok: true });
    }
  } catch (e: any) {
    if (/does not exist|relation .* does not exist/i.test(e?.message || '')) {
      return NextResponse.json({ ok: true, pending: true });
    }
    throw e;
  }

  return NextResponse.json({ error: 'ids[] or all=true required' }, { status: 400 });
}
