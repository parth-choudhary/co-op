import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';

const ALLOWED_ROLES = ['admin', 'member'] as const;

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const actor = session.user as any;
  if (actor.role !== 'admin') return NextResponse.json({ error: 'Admin role required' }, { status: 403 });

  const { userId } = await params;
  const { role } = await request.json().catch(() => ({ role: null }));
  if (!role || !ALLOWED_ROLES.includes(role)) {
    return NextResponse.json({ error: `Role must be one of: ${ALLOWED_ROLES.join(', ')}` }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, companyId: true, role: true } });
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (target.companyId !== actor.companyId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  if (target.id === actor.id && role !== 'admin') {
    const otherAdmins = await prisma.user.count({
      where: { companyId: actor.companyId, role: 'admin', id: { not: actor.id } },
    });
    if (otherAdmins === 0) {
      return NextResponse.json({ error: 'Cannot demote the last admin' }, { status: 400 });
    }
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { role },
    select: { id: true, name: true, email: true, role: true },
  });
  return NextResponse.json({ user: updated });
}
