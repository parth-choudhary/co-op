import prisma from './db';

export type NotificationType =
  | 'card_mention'
  | 'card_assigned'
  | 'card_member_added'
  | 'comment_mention'
  | 'comment_reply';

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  title: string;
  summary: string;
  projectId?: string | null;
  boardId?: string | null;
  cardId?: string | null;
  commentId?: string | null;
  link: string;
  actorName?: string | null;
}

export async function createNotification(input: NotifyInput) {
  const model: any = (prisma as any).notification;
  if (!model) {
    console.warn('[createNotification] prisma.notification is undefined — run `prisma generate`');
    return;
  }
  try {
    await model.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        summary: input.summary.slice(0, 500),
        projectId: input.projectId ?? null,
        boardId: input.boardId ?? null,
        cardId: input.cardId ?? null,
        commentId: input.commentId ?? null,
        link: input.link,
        actorName: input.actorName ?? null,
      },
    });
  } catch (err) {
    console.error('[createNotification] failed', err);
  }
}

async function getCardLocation(cardId: string): Promise<{ projectId: string; boardId: string; title: string; link: string } | null> {
  const card = await prisma.card.findUnique({
    where: { id: cardId },
    select: {
      title: true,
      column: { select: { boardId: true, board: { select: { projectId: true } } } },
    },
  });
  if (!card) return null;
  const projectId = card.column.board.projectId;
  const boardId = card.column.boardId;
  return {
    projectId,
    boardId,
    title: card.title,
    link: `/p/${projectId}/boards/${boardId}?card=${cardId}`,
  };
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function extractUserMentions(
  content: string,
  projectUsers: Array<{ id: string; name: string; email: string | null }>
): string[] {
  if (!content) return [];
  const tokens = new Set((content.match(/@[\w.\-+]+/g) || []).map((m) => normalize(m.slice(1))));
  if (tokens.size === 0) return [];
  const hits = new Set<string>();
  for (const u of projectUsers) {
    const aliases = new Set<string>();
    aliases.add(normalize(u.name));
    const first = u.name.split(/\s+/)[0];
    if (first) aliases.add(normalize(first));
    if (u.email) {
      aliases.add(normalize(u.email.split('@')[0]));
      aliases.add(normalize(u.email));
    }
    for (const t of tokens) {
      if (aliases.has(t)) {
        hits.add(u.id);
        break;
      }
    }
  }
  return [...hits];
}

async function getProjectUsers(projectId: string) {
  const rows = await prisma.projectMember.findMany({
    where: { projectId },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  return rows.map((r: any) => r.user as { id: string; name: string; email: string });
}

/** Notify a user they were added as a member on a card. */
export async function notifyCardMemberAdded(opts: {
  cardId: string;
  userId: string;
  actorName: string;
  actorId?: string | null;
}) {
  if (opts.actorId && opts.actorId === opts.userId) return;
  const loc = await getCardLocation(opts.cardId);
  if (!loc) return;
  await createNotification({
    userId: opts.userId,
    type: 'card_member_added',
    title: `${opts.actorName} added you to "${loc.title}"`,
    summary: `You were added as a member on card "${loc.title}".`,
    projectId: loc.projectId,
    boardId: loc.boardId,
    cardId: opts.cardId,
    link: loc.link,
    actorName: opts.actorName,
  });
}

/** Notify a user they were assigned to a card. */
export async function notifyCardAssigned(opts: {
  cardId: string;
  userId: string;
  actorName: string;
  actorId?: string | null;
}) {
  if (opts.actorId && opts.actorId === opts.userId) return;
  const loc = await getCardLocation(opts.cardId);
  if (!loc) return;
  await createNotification({
    userId: opts.userId,
    type: 'card_assigned',
    title: `${opts.actorName} assigned you to "${loc.title}"`,
    summary: `You are now the assignee on card "${loc.title}".`,
    projectId: loc.projectId,
    boardId: loc.boardId,
    cardId: opts.cardId,
    link: loc.link,
    actorName: opts.actorName,
  });
}

/** Scan text for @mentions of users in the project and notify each. */
export async function notifyMentionsInCardText(opts: {
  cardId: string;
  content: string;
  actorName: string;
  actorId?: string | null;
  kind: 'card_mention' | 'comment_mention';
  commentId?: string | null;
}) {
  if (!opts.content?.trim()) return;
  const loc = await getCardLocation(opts.cardId);
  if (!loc) return;
  const users = await getProjectUsers(loc.projectId);
  const mentionedIds = extractUserMentions(opts.content, users).filter(
    (id) => !opts.actorId || id !== opts.actorId
  );
  if (mentionedIds.length === 0) return;

  const excerpt = opts.content.trim().replace(/\s+/g, ' ').slice(0, 240);
  const where = opts.kind === 'comment_mention' ? 'in a comment on' : 'on';
  await Promise.all(
    mentionedIds.map((uid) =>
      createNotification({
        userId: uid,
        type: opts.kind,
        title: `${opts.actorName} mentioned you ${where} "${loc.title}"`,
        summary: excerpt,
        projectId: loc.projectId,
        boardId: loc.boardId,
        cardId: opts.cardId,
        commentId: opts.commentId ?? null,
        link: loc.link,
        actorName: opts.actorName,
      })
    )
  );
}
