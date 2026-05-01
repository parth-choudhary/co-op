// Bulk pill-metadata lookup. The chat / comment renderer hands us all card keys
// it found in a batch of visible messages; we return the title + status + url
// for each one in a single roundtrip.
//
// Request:  { projectId: string, keys: string[] }
// Response: { cards: Record<key, { id, title, columnName, boardId, url }> }
//
// Keys missing from the response are unknown (deleted, wrong project, malformed)
// — the renderer should fall back to a plain link in that case.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';
import { parseCardKey } from '@/lib/cardKeys';
import { pathForCardKey } from '@/lib/appRoutes';

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { projectId, keys } = await request.json();
  if (!projectId || !Array.isArray(keys)) {
    return NextResponse.json({ error: 'projectId and keys[] required' }, { status: 400 });
  }

  const userId = (session.user as any).id as string;
  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { projectId: true },
  });
  if (!member) return NextResponse.json({ error: 'Not a project member' }, { status: 403 });

  const numbers: number[] = [];
  const keyByNumber = new Map<number, string>();
  for (const k of keys) {
    if (typeof k !== 'string') continue;
    const parsed = parseCardKey(k);
    if (parsed) {
      numbers.push(parsed.number);
      keyByNumber.set(parsed.number, k);
    }
  }
  if (numbers.length === 0) return NextResponse.json({ cards: {} });

  // Single query bounded by the project's prefix — prevents leaking across projects.
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { cardKeyPrefix: true },
  });
  if (!project?.cardKeyPrefix) return NextResponse.json({ cards: {} });

  const cards = await prisma.card.findMany({
    where: { projectId, number: { in: numbers } },
    select: {
      id: true, title: true, number: true,
      column: { select: { name: true, board: { select: { id: true } } } },
    },
  });

  const out: Record<string, { id: string; title: string; columnName: string; boardId: string; url: string }> = {};
  for (const c of cards) {
    if (typeof c.number !== 'number') continue;
    const key = keyByNumber.get(c.number);
    if (!key) continue;
    out[key] = {
      id: c.id,
      title: c.title,
      columnName: c.column?.name ?? '',
      boardId: c.column?.board?.id ?? '',
      url: pathForCardKey(projectId, key),
    };
  }

  return NextResponse.json({ cards: out });
}
