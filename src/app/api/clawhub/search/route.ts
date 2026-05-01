import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { clawhubSearch, clawhubBrowse } from '@/lib/clawhub';

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const q = request.nextUrl.searchParams.get('q')?.trim() || '';
  const sort = (request.nextUrl.searchParams.get('sort') || 'trending') as any;
  const limit = parseInt(request.nextUrl.searchParams.get('limit') || '20', 10);
  try {
    const results = q ? await clawhubSearch(q, limit) : await clawhubBrowse(sort, limit);
    return NextResponse.json({ results });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'ClawHub fetch failed' }, { status: 502 });
  }
}
