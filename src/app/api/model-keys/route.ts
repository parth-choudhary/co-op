import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user as any;
  const keys = await prisma.modelKey.findMany({
    where: { companyId: user.companyId },
    select: { id: true, provider: true, label: true, isValid: true, lastUsedAt: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(keys);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user as any;
  const { provider, key, label } = await request.json();
  if (!provider || !key) return NextResponse.json({ error: 'Provider and key required' }, { status: 400 });
  const modelKey = await prisma.modelKey.create({
    data: { companyId: user.companyId, provider, keyEncrypted: key, label: label || null, isValid: true },
    select: { id: true, provider: true, label: true, isValid: true, createdAt: true },
  });
  return NextResponse.json(modelKey, { status: 201 });
}
