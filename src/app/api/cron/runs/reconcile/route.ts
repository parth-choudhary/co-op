import { NextRequest, NextResponse } from 'next/server';
import { reconcileRuns } from '@/lib/coding/reconciler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  // Vercel Cron sets `Authorization: Bearer <CRON_SECRET>`. Manual triggers can
  // pass `?token=<CRON_SECRET>`.
  const header = request.headers.get('authorization');
  if (header === `Bearer ${secret}`) return true;
  if (request.nextUrl.searchParams.get('token') === secret) return true;
  return false;
}

async function handle(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const summary = await reconcileRuns();
  return NextResponse.json(summary);
}

// Vercel Cron only sends GET; allow POST too for manual operator runs.
export const GET = handle;
export const POST = handle;
