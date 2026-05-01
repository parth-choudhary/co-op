import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user as any;
  const projectId = request.nextUrl.searchParams.get('projectId');

  if (projectId) {
    const membership = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: user.id } },
    });
    if (!membership) return NextResponse.json({ error: 'Not a member' }, { status: 403 });

    const [members, agents] = await Promise.all([
      prisma.projectMember.findMany({
        where: { projectId },
        include: { user: { select: { id: true, name: true, email: true, avatarUrl: true, role: true } } },
        orderBy: { user: { name: 'asc' } },
      }),
      prisma.aIAgent.findMany({
        where: { projectId, isActive: true },
        select: { id: true, name: true, role: true, roleLabel: true, avatarUrl: true },
        orderBy: { name: 'asc' },
      }),
    ]);
    return NextResponse.json({ users: members.map((m: any) => m.user), agents });
  }

  const [users, agents] = await Promise.all([
    prisma.user.findMany({
      where: { companyId: user.companyId },
      select: { id: true, name: true, email: true, avatarUrl: true, role: true },
      orderBy: { name: 'asc' },
    }),
    prisma.aIAgent.findMany({
      where: { companyId: user.companyId, isActive: true },
      select: { id: true, name: true, role: true, roleLabel: true, avatarUrl: true },
      orderBy: { name: 'asc' },
    }),
  ]);
  return NextResponse.json({ users, agents });
}
