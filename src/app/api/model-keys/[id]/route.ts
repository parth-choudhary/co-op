import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const user = session.user as any;
  await prisma.modelKey.deleteMany({ where: { id, companyId: user.companyId } });
  return NextResponse.json({ message: 'Deleted' });
}
