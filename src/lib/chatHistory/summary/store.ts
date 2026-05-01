// Persistence for rolling summaries. Two parallel tables, one for chat rooms
// (RoomSummary) and one for card threads (CardThreadSummary). Same shape, two
// different upTo cursors (eventId vs commentId).

import prisma from '../../db';

export interface StoredSummary {
  summary: string;
  upToId: string | null;
  upToTimestamp: Date | null;
  messageCount: number;
}

export async function readChatSummary(channelId: string): Promise<StoredSummary | null> {
  const row = await prisma.roomSummary.findUnique({ where: { channelId } });
  if (!row) return null;
  return {
    summary: row.summary,
    upToId: row.upToEventId,
    upToTimestamp: row.upToTimestamp,
    messageCount: row.messageCount,
  };
}

export async function writeChatSummary(opts: {
  channelId: string;
  summary: string;
  upToId: string | null;
  upToTimestamp: Date | null;
  messageCount: number;
  modelUsed: string;
}): Promise<void> {
  await prisma.roomSummary.upsert({
    where: { channelId: opts.channelId },
    create: {
      channelId: opts.channelId,
      summary: opts.summary,
      upToEventId: opts.upToId,
      upToTimestamp: opts.upToTimestamp,
      messageCount: opts.messageCount,
      modelUsed: opts.modelUsed,
    },
    update: {
      summary: opts.summary,
      upToEventId: opts.upToId,
      upToTimestamp: opts.upToTimestamp,
      messageCount: opts.messageCount,
      modelUsed: opts.modelUsed,
    },
  });
}

export async function readCardSummary(cardId: string): Promise<StoredSummary | null> {
  const row = await prisma.cardThreadSummary.findUnique({ where: { cardId } });
  if (!row) return null;
  return {
    summary: row.summary,
    upToId: row.upToCommentId,
    upToTimestamp: row.upToTimestamp,
    messageCount: row.messageCount,
  };
}

export async function writeCardSummary(opts: {
  cardId: string;
  summary: string;
  upToId: string | null;
  upToTimestamp: Date | null;
  messageCount: number;
  modelUsed: string;
}): Promise<void> {
  await prisma.cardThreadSummary.upsert({
    where: { cardId: opts.cardId },
    create: {
      cardId: opts.cardId,
      summary: opts.summary,
      upToCommentId: opts.upToId,
      upToTimestamp: opts.upToTimestamp,
      messageCount: opts.messageCount,
      modelUsed: opts.modelUsed,
    },
    update: {
      summary: opts.summary,
      upToCommentId: opts.upToId,
      upToTimestamp: opts.upToTimestamp,
      messageCount: opts.messageCount,
      modelUsed: opts.modelUsed,
    },
  });
}
