// Canonical card-by-key page. Resolves "COOP-123" → boardId + cardId and
// redirects to the board view with the card modal open. This is the URL
// pasted in chat / comments and detected as a pill.

import { redirect, notFound } from 'next/navigation';
import { findCardByKey } from '@/lib/cardKeyAssign';
import { pathForCardOnBoard } from '@/lib/appRoutes';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ projectId: string; cardKey: string }>;
}

export default async function CanonicalCardPage({ params }: Props) {
  const { projectId, cardKey } = await params;
  const card = await findCardByKey(projectId, cardKey);
  if (!card) notFound();
  redirect(pathForCardOnBoard(projectId, card.boardId, card.id));
}
