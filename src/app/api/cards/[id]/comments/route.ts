import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';
import { logAgentActivityBulk, getAgentsOnCard } from '@/lib/agentHarness';
import { handleCardComment } from '@/lib/agentRunner';
import { notifyMentionsInCardText, createNotification } from '@/lib/notifications';
import { evaluateAndMaybeDispatch } from '@/lib/coding/triggers';

async function enrichComments(rows: any[]) {
  const agentIds = [...new Set(rows.filter(r => r.authorType === 'agent').map(r => r.authorId))];
  let agentMap: Record<string, { id: string; name: string; role: string | null; roleLabel: string | null; avatarUrl: string | null }> = {};
  if (agentIds.length > 0) {
    const agents = await prisma.aIAgent.findMany({
      where: { id: { in: agentIds } },
      select: { id: true, name: true, role: true, roleLabel: true, avatarUrl: true },
    });
    agentMap = Object.fromEntries(agents.map((a: any) => [a.id, a]));
  }
  return rows.map((r) => {
    if (r.authorType === 'agent') {
      const a = agentMap[r.authorId];
      return { ...r, author: a ? { id: a.id, name: a.name, avatarUrl: a.avatarUrl, role: a.roleLabel || a.role } : null };
    }
    return r;
  });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const url = new URL(request.url);
  const cursor = url.searchParams.get('cursor');
  const take = 40;

  const comments = await prisma.comment.findMany({
    where: { cardId: id },
    orderBy: { createdAt: 'desc' },
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      author: { select: { id: true, name: true, avatarUrl: true } },
    },
  });

  const hasMore = comments.length > take;
  if (hasMore) comments.pop();

  const enriched = await enrichComments(comments);
  return NextResponse.json({ comments: enriched, hasMore, nextCursor: hasMore ? enriched[enriched.length - 1]?.id : null });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const user = session.user as any;
  const { content, parentCommentId } = await request.json();
  if (!content?.trim()) return NextResponse.json({ error: 'Content required' }, { status: 400 });

  if (parentCommentId) {
    const parent = await prisma.comment.findFirst({ where: { id: parentCommentId, cardId: id }, select: { id: true } });
    if (!parent) return NextResponse.json({ error: 'Parent comment not found on this card' }, { status: 400 });
  }

  const comment = await prisma.comment.create({
    data: {
      cardId: id,
      content: content.trim(),
      authorType: 'user',
      authorId: user.id,
      parentCommentId: parentCommentId || null,
    },
    include: {
      author: { select: { id: true, name: true, avatarUrl: true } },
    },
  });

  await prisma.cardActivity.create({
    data: {
      cardId: id, type: parentCommentId ? 'comment_reply' : 'comment',
      content: content.trim().slice(0, 200),
      actorId: user.id, actorType: 'user',
    },
  });

  const agentIds = await getAgentsOnCard(id);
  await logAgentActivityBulk(agentIds, 'card_commented', {
    cardId: id,
    commentId: comment.id,
    parentCommentId: parentCommentId || null,
    excerpt: content.trim().slice(0, 200),
    author: user.name,
  });

  handleCardComment({
    cardId: id,
    commentId: comment.id,
    parentCommentId: parentCommentId || null,
    content: content.trim(),
    senderName: user.name || 'User',
  }).catch((err) => console.error('[handleCardComment]', err));

  notifyMentionsInCardText({
    cardId: id,
    content: content.trim(),
    actorName: user.name || 'Someone',
    actorId: user.id,
    kind: 'comment_mention',
    commentId: comment.id,
  }).catch((err) => console.error('[notifyMentions]', err));

  if (parentCommentId) {
    (async () => {
      try {
        const parent = await prisma.comment.findUnique({
          where: { id: parentCommentId },
          select: { authorType: true, authorId: true, card: { select: { title: true, column: { select: { boardId: true, board: { select: { projectId: true } } } } } } },
        });
        if (parent && parent.authorType === 'user' && parent.authorId && parent.authorId !== user.id) {
          const projectId = parent.card.column.board.projectId;
          const boardId = parent.card.column.boardId;
          await createNotification({
            userId: parent.authorId,
            type: 'comment_reply',
            title: `${user.name || 'Someone'} replied on "${parent.card.title}"`,
            summary: content.trim().slice(0, 240),
            projectId, boardId, cardId: id, commentId: comment.id,
            link: `/p/${projectId}/boards/${boardId}?card=${id}`,
            actorName: user.name || 'Someone',
          });
        }
      } catch (err) { console.error('[notifyReply]', err); }
    })();
  }

  evaluateAndMaybeDispatch({
    kind: 'comment',
    cardId: id,
    commentText: content.trim(),
    commentAuthorType: 'user',
    actorUserId: user.id,
  }).catch((err) => console.error('[trigger:comment]', err));

  return NextResponse.json(comment, { status: 201 });
}
