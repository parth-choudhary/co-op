// Comment source: pulls a card's comment thread and converts to RawTurn[].
// Authors come in two flavours (authorType = 'user' | 'agent'); we surface both
// via SenderRef so the resolver can label them with display names.

import prisma from '../../db';
import type { RawTurn } from '../types';
import { HISTORY_CONFIG } from '../types';

export async function fetchCardCommentTurns(opts: {
  cardId: string;
  limit?: number;
}): Promise<RawTurn[]> {
  const limit = opts.limit ?? HISTORY_CONFIG.commentFetchLimit;

  // Newest-first from the DB so we get the *most recent* `limit` comments for
  // long threads, then reverse to chronological for downstream processing.
  const comments = await prisma.comment.findMany({
    where: { cardId: opts.cardId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      content: true,
      authorType: true,
      authorId: true,
      createdAt: true,
    },
  });

  type CommentRow = { id: string; content: string; authorType: string; authorId: string; createdAt: Date };
  const turns: RawTurn[] = (comments as CommentRow[]).map((c) => ({
    id: c.id,
    timestamp: c.createdAt,
    sender: c.authorType === 'agent'
      ? { agentId: c.authorId }
      : { userId: c.authorId },
    content: c.content,
  }));
  turns.reverse();
  return turns;
}
