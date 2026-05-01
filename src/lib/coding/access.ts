import prisma from '@/lib/db';

export async function projectIdForCard(cardId: string): Promise<string | null> {
  const row = await prisma.card.findUnique({
    where: { id: cardId },
    select: { column: { select: { board: { select: { projectId: true } } } } },
  });
  return row?.column?.board?.projectId ?? null;
}

export async function isProjectMember(projectId: string, userId: string): Promise<boolean> {
  const m = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  return !!m;
}
