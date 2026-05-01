import { NextRequest, NextResponse } from 'next/server';
import { runTick } from '@/lib/scheduler/tick';

export async function GET(request: NextRequest) {
  const tokenHeader = request.headers.get('x-coop-cron-token');
  if (process.env.COOP_CRON_TOKEN && tokenHeader !== process.env.COOP_CRON_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { launched, scheduledFired } = await runTick();
  return NextResponse.json({ ok: true, launched, matched: launched.length, scheduledFired });
}

export const POST = GET;
