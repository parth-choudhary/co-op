import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const user = session.user as any;
  const project = await prisma.project.findFirst({
    where: { id, companyId: user.companyId },
    include: {
      boards: {
        include: {
          columns: {
            orderBy: { position: 'asc' },
            include: {
              cards: {
                orderBy: { position: 'asc' },
                include: {
                  assigneeUser: { select: { id: true, name: true, avatarUrl: true } },
                  assigneeAgent: { select: { id: true, name: true, role: true, avatarUrl: true } },
                  _count: { select: { comments: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(project);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const user = session.user as any;
  const data = await request.json();
  await prisma.project.updateMany({
    where: { id, companyId: user.companyId },
    data: { name: data.name?.trim(), description: data.description?.trim(), color: data.color },
  });
  return NextResponse.json({ message: 'Updated' });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const user = session.user as any;
  await prisma.project.deleteMany({ where: { id, companyId: user.companyId } });
  return NextResponse.json({ message: 'Deleted' });
}
