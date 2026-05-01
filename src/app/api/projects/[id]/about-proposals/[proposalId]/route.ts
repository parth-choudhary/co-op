import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';

// POST body: { action: 'approve' | 'reject' }
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; proposalId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id, proposalId } = await params;
  const user = session.user as any;

  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId: id, userId: user.id } },
  });
  if (!membership) return NextResponse.json({ error: 'Not a member' }, { status: 403 });

  const { action } = await request.json();
  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: 'action must be approve or reject' }, { status: 400 });
  }

  const proposal = await prisma.projectAboutProposal.findUnique({ where: { id: proposalId } });
  if (!proposal || proposal.projectId !== id) return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
  if (proposal.status !== 'pending') return NextResponse.json({ error: 'Already reviewed' }, { status: 400 });

  if (action === 'approve') {
    await prisma.$transaction([
      prisma.project.update({ where: { id }, data: { about: proposal.proposedText, aboutUpdatedAt: new Date() } }),
      prisma.projectAboutProposal.update({
        where: { id: proposalId },
        data: { status: 'approved', reviewedById: user.id, reviewedAt: new Date() },
      }),
    ]);
  } else {
    await prisma.projectAboutProposal.update({
      where: { id: proposalId },
      data: { status: 'rejected', reviewedById: user.id, reviewedAt: new Date() },
    });
  }

  return NextResponse.json({ ok: true });
}
