import prisma from './db';
import { logAgentActivity, logAgentActivityBulk, getAgentsOnCard } from './agentHarness';
import { notifyCardAssigned, notifyCardMemberAdded, notifyMentionsInCardText } from './notifications';
import { assignNextCardNumber, resolveProjectIdForColumn, resolveCardId } from './cardKeyAssign';
import { formatCardKey } from './cardKeys';
import { pathForCardKey } from './appRoutes';
import { embedText, toVectorLiteral } from './embeddings';

/**
 * Decorate a card-shaped object with `key` and `_url` for tool consumers.
 * Expects the card was queried with at minimum `number`, `projectId`, and a
 * `project: { select: { cardKeyPrefix: true } }` join. Returns the input
 * unchanged if any of those are missing (cards predating the migration, etc.).
 */
function enrichCard<T extends { number?: number | null; projectId?: string | null; project?: { cardKeyPrefix?: string | null } | null } | null | undefined>(
  card: T,
): T extends null | undefined ? T : T & { key?: string; _url?: string } {
  if (!card) return card as any;
  const prefix = card.project?.cardKeyPrefix;
  if (!prefix || !card.projectId || typeof card.number !== 'number') return card as any;
  const key = formatCardKey(prefix, card.number);
  return { ...card, key, _url: pathForCardKey(card.projectId, key) } as any;
}

async function agentDisplayName(agentId: string): Promise<string> {
  const a = await prisma.aIAgent.findUnique({ where: { id: agentId }, select: { name: true } });
  return a?.name || 'Agent';
}

export type AgentAction =
  | { type: 'create_card'; columnId: string; title: string; description?: string; priority?: string; labels?: string[]; parentCardId?: string }
  | { type: 'list_subtasks'; cardId: string }
  | { type: 'update_card'; cardId: string; title?: string; description?: string; priority?: string; labels?: string[]; dueDate?: string | null }
  | { type: 'move_card'; cardId: string; columnId: string; position?: number }
  | { type: 'add_comment'; cardId: string; content: string; parentCommentId?: string }
  | { type: 'list_comments'; cardId: string; limit?: number }
  | { type: 'assign_card'; cardId: string; agentId?: string; userId?: string }
  | { type: 'unassign_card'; cardId: string }
  | { type: 'add_member'; cardId: string; agentId?: string; userId?: string }
  | { type: 'remove_member'; cardId: string; agentId?: string; userId?: string }
  | { type: 'create_checklist'; cardId: string; title: string; items?: string[] }
  | { type: 'toggle_checklist_item'; itemId: string; isChecked: boolean }
  | { type: 'list_boards'; projectId: string }
  | { type: 'list_columns'; boardId: string }
  | { type: 'list_cards'; columnId: string }
  | { type: 'get_card'; cardId: string }
  | { type: 'propose_about_update'; newText: string; reason: string }
  | { type: 'set_project_memory'; key: string; content: string; kind?: string }
  | { type: 'start_coding_task'; cardId: string; notes?: string; force?: boolean };

export interface ActionResult {
  ok: boolean;
  data?: any;
  error?: string;
}

export async function executeAction(agentId: string, action: AgentAction): Promise<ActionResult> {
  switch (action.type) {
    case 'create_card':
      return createCard(agentId, action);
    case 'update_card':
      return updateCard(agentId, action);
    case 'move_card':
      return moveCard(agentId, action);
    case 'add_comment':
      return addComment(agentId, action);
    case 'list_comments':
      return listComments(action);
    case 'assign_card':
      return assignCard(agentId, action);
    case 'unassign_card':
      return unassignCard(agentId, action);
    case 'add_member':
      return addMember(agentId, action);
    case 'remove_member':
      return removeMember(agentId, action);
    case 'create_checklist':
      return createChecklist(agentId, action);
    case 'toggle_checklist_item':
      return toggleChecklistItem(agentId, action);
    case 'list_boards':
      return listBoards(action);
    case 'list_columns':
      return listColumns(action);
    case 'list_cards':
      return listCards(action);
    case 'get_card':
      return getCard(action);
    case 'list_subtasks':
      return listSubtasks(action);
    case 'propose_about_update':
      return proposeAboutUpdate(agentId, action);
    case 'set_project_memory':
      return setProjectMemory(agentId, action);
    case 'start_coding_task':
      return startCodingTask(agentId, action);
    default:
      return { ok: false, error: `Unknown action type: ${(action as any).type}` };
  }
}

async function createCard(agentId: string, action: Extract<AgentAction, { type: 'create_card' }>): Promise<ActionResult> {
  if (action.parentCardId) {
    const parent = await prisma.card.findUnique({ where: { id: action.parentCardId }, select: { id: true } });
    if (!parent) return { ok: false, error: 'parentCardId does not match an existing card' };
  }
  const projectId = await resolveProjectIdForColumn(action.columnId);
  if (!projectId) return { ok: false, error: 'columnId does not match an existing column' };
  const [maxPos, assigned] = await Promise.all([
    prisma.card.aggregate({ where: { columnId: action.columnId }, _max: { position: true } }),
    assignNextCardNumber(projectId),
  ]);
  const card = await prisma.card.create({
    data: {
      columnId: action.columnId,
      title: action.title.trim(),
      description: action.description?.trim() || null,
      priority: action.priority || 'medium',
      labels: action.labels || [],
      position: (maxPos._max.position ?? -1) + 1,
      parentCardId: action.parentCardId || null,
      projectId,
      number: assigned.number,
    },
  });

  if (action.parentCardId) {
    await prisma.cardActivity.create({
      data: {
        cardId: action.parentCardId,
        type: 'subtask_added',
        content: `added subtask "${card.title}"`,
        actorId: agentId,
        actorType: 'agent',
        metadata: { subtaskId: card.id } as any,
      },
    });
  }

  await prisma.cardActivity.create({
    data: {
      cardId: card.id,
      type: 'created',
      content: `created this card`,
      actorId: agentId,
      actorType: 'agent',
    },
  });

  await logAgentActivity(agentId, 'card_updated', {
    cardId: card.id,
    title: card.title,
    action: 'created',
  });

  const key = assigned.prefix ? formatCardKey(assigned.prefix, assigned.number) : undefined;
  return {
    ok: true,
    data: {
      id: card.id, title: card.title, position: card.position,
      ...(key ? { key, _url: pathForCardKey(projectId, key) } : {}),
    },
  };
}

async function updateCard(agentId: string, action: Extract<AgentAction, { type: 'update_card' }>): Promise<ActionResult> {
  const updateData: any = {};
  const changes: string[] = [];

  if (action.title !== undefined) { updateData.title = action.title.trim(); changes.push(`title → "${updateData.title}"`); }
  if (action.description !== undefined) { updateData.description = action.description?.trim() || null; changes.push('updated description'); }
  if (action.priority !== undefined) { updateData.priority = action.priority; changes.push(`priority → ${action.priority}`); }
  if (action.labels !== undefined) { updateData.labels = action.labels; changes.push('updated labels'); }
  if (action.dueDate !== undefined) { updateData.dueDate = action.dueDate ? new Date(action.dueDate) : null; changes.push(action.dueDate ? 'set due date' : 'removed due date'); }

  if (changes.length === 0) return { ok: false, error: 'No fields to update' };

  const card = await prisma.card.update({ where: { id: action.cardId }, data: updateData });

  await prisma.cardActivity.create({
    data: {
      cardId: action.cardId,
      type: 'updated',
      content: changes.join(', '),
      actorId: agentId,
      actorType: 'agent',
    },
  });

  const agentIds = await getAgentsOnCard(action.cardId);
  await logAgentActivityBulk(agentIds, 'card_updated', { cardId: action.cardId, title: card.title, changes });

  return { ok: true, data: { id: card.id, title: card.title, changes } };
}

async function moveCard(agentId: string, action: Extract<AgentAction, { type: 'move_card' }>): Promise<ActionResult> {
  const card = await prisma.card.findUnique({ where: { id: action.cardId }, include: { column: { select: { boardId: true } } } });
  if (!card) return { ok: false, error: 'Card not found' };

  const targetCol = await prisma.column.findUnique({ where: { id: action.columnId }, select: { id: true, boardId: true, name: true } });
  if (!targetCol) return { ok: false, error: `Target column ${action.columnId} does not exist. Call list_columns for the card's board first.` };
  if (targetCol.boardId !== card.column.boardId) return { ok: false, error: `Target column is on a different board. Source board: ${card.column.boardId}, target board: ${targetCol.boardId}. Pick a column on the same board.` };

  const targetPosition = action.position ?? (await prisma.card.aggregate({ where: { columnId: action.columnId }, _max: { position: true } }))._max.position ?? 0;
  const sameColumn = card.columnId === action.columnId;

  await prisma.$transaction(async (tx: any) => {
    if (sameColumn) {
      const oldPos = card.position;
      if (oldPos < targetPosition) {
        await tx.card.updateMany({ where: { columnId: action.columnId, position: { gt: oldPos, lte: targetPosition } }, data: { position: { decrement: 1 } } });
      } else if (oldPos > targetPosition) {
        await tx.card.updateMany({ where: { columnId: action.columnId, position: { gte: targetPosition, lt: oldPos } }, data: { position: { increment: 1 } } });
      }
    } else {
      await tx.card.updateMany({ where: { columnId: card.columnId, position: { gt: card.position } }, data: { position: { decrement: 1 } } });
      await tx.card.updateMany({ where: { columnId: action.columnId, position: { gte: targetPosition } }, data: { position: { increment: 1 } } });
    }
    await tx.card.update({ where: { id: action.cardId }, data: { columnId: action.columnId, position: targetPosition } });
  });

  const [srcCol, dstCol] = await Promise.all([
    prisma.column.findUnique({ where: { id: card.columnId }, select: { name: true } }),
    prisma.column.findUnique({ where: { id: action.columnId }, select: { name: true } }),
  ]);

  await prisma.cardActivity.create({
    data: {
      cardId: action.cardId,
      type: 'moved',
      content: sameColumn ? `reordered in ${dstCol?.name}` : `moved from ${srcCol?.name} to ${dstCol?.name}`,
      actorId: agentId,
      actorType: 'agent',
    },
  });

  const agentIds = await getAgentsOnCard(action.cardId);
  await logAgentActivityBulk(agentIds, 'card_moved', {
    cardId: action.cardId,
    title: card.title,
    fromColumn: srcCol?.name,
    toColumn: dstCol?.name,
    position: targetPosition,
  });

  if (!sameColumn) {
    const { evaluateAndMaybeDispatch } = await import('./coding/triggers');
    evaluateAndMaybeDispatch({
      kind: 'column_move',
      cardId: action.cardId,
      toColumnId: action.columnId,
      actorAgentId: agentId,
    }).catch((err) => console.error('[trigger:column_move:agent]', err));
  }

  return { ok: true, data: { id: action.cardId, from: srcCol?.name, to: dstCol?.name } };
}

async function addComment(agentId: string, action: Extract<AgentAction, { type: 'add_comment' }>): Promise<ActionResult> {
  if (action.parentCommentId) {
    const parent = await prisma.comment.findFirst({
      where: { id: action.parentCommentId, cardId: action.cardId },
      select: { id: true },
    });
    if (!parent) return { ok: false, error: 'parentCommentId does not match a comment on this card' };
  }

  const comment = await prisma.comment.create({
    data: {
      cardId: action.cardId,
      content: action.content.trim(),
      authorType: 'agent',
      authorId: agentId,
      parentCommentId: action.parentCommentId || null,
    },
  });

  await prisma.cardActivity.create({
    data: {
      cardId: action.cardId,
      type: action.parentCommentId ? 'comment_reply' : 'comment',
      content: action.content.trim().slice(0, 200),
      actorId: agentId,
      actorType: 'agent',
    },
  });

  const agentIds = await getAgentsOnCard(action.cardId);
  await logAgentActivityBulk(agentIds, 'card_commented', {
    cardId: action.cardId,
    commentId: comment.id,
    parentCommentId: action.parentCommentId || null,
    excerpt: action.content.trim().slice(0, 200),
    author: `agent:${agentId}`,
  });

  const actorName = await agentDisplayName(agentId);
  await notifyMentionsInCardText({
    cardId: action.cardId,
    content: action.content.trim(),
    actorName,
    kind: 'comment_mention',
    commentId: comment.id,
  });

  return { ok: true, data: { commentId: comment.id, parentCommentId: comment.parentCommentId } };
}

async function listComments(action: Extract<AgentAction, { type: 'list_comments' }>): Promise<ActionResult> {
  const take = Math.min(Math.max(action.limit ?? 20, 1), 100);
  const rows = await prisma.comment.findMany({
    where: { cardId: action.cardId },
    orderBy: { createdAt: 'desc' },
    take,
    include: { author: { select: { name: true } } },
  });
  const agentIds = [...new Set(rows.filter((r: any) => r.authorType === 'agent').map((r: any) => r.authorId))];
  const agents = agentIds.length
    ? await prisma.aIAgent.findMany({ where: { id: { in: agentIds } }, select: { id: true, name: true, roleLabel: true } })
    : [];
  const agentMap = Object.fromEntries(agents.map((a: any) => [a.id, a]));
  const data = rows.map((r: any) => ({
    id: r.id,
    parentCommentId: r.parentCommentId,
    content: r.content,
    createdAt: r.createdAt,
    author: r.authorType === 'agent'
      ? { kind: 'agent', id: r.authorId, name: agentMap[r.authorId]?.name || 'Agent', role: agentMap[r.authorId]?.roleLabel }
      : { kind: 'user', id: r.authorId, name: r.author?.name || 'User' },
  }));
  return { ok: true, data };
}

async function assignCard(agentId: string, action: Extract<AgentAction, { type: 'assign_card' }>): Promise<ActionResult> {
  const updateData: any = {};
  if (action.agentId) {
    updateData.assigneeType = 'agent';
    updateData.assigneeAgentId = action.agentId;
    updateData.assigneeUserId = null;
  } else if (action.userId) {
    updateData.assigneeType = 'user';
    updateData.assigneeUserId = action.userId;
    updateData.assigneeAgentId = null;
  } else {
    return { ok: false, error: 'Must provide agentId or userId' };
  }

  const card = await prisma.card.update({ where: { id: action.cardId }, data: updateData });

  await prisma.cardActivity.create({
    data: {
      cardId: action.cardId,
      type: 'assigned',
      content: `assigned to ${action.agentId ? 'agent' : 'user'}`,
      actorId: agentId,
      actorType: 'agent',
    },
  });

  const assigneeAgentId = action.agentId;
  if (assigneeAgentId) {
    await logAgentActivity(assigneeAgentId, 'card_assigned', { cardId: action.cardId, title: card.title, assignedBy: `agent:${agentId}` });
    const { evaluateAndMaybeDispatch } = await import('./coding/triggers');
    evaluateAndMaybeDispatch({
      kind: 'assignment',
      cardId: action.cardId,
      assigneeAgentId,
      actorAgentId: agentId,
    }).catch((err) => console.error('[trigger:assignment:agent]', err));
  }
  if (action.userId) {
    const name = await agentDisplayName(agentId);
    await notifyCardAssigned({ cardId: action.cardId, userId: action.userId, actorName: name });
  }

  return { ok: true, data: { id: card.id, assigneeType: updateData.assigneeType } };
}

async function unassignCard(agentId: string, action: Extract<AgentAction, { type: 'unassign_card' }>): Promise<ActionResult> {
  const card = await prisma.card.findUnique({ where: { id: action.cardId }, select: { assigneeAgentId: true, title: true } });
  if (!card) return { ok: false, error: 'Card not found' };

  const prevAgentId = card.assigneeAgentId;

  await prisma.card.update({
    where: { id: action.cardId },
    data: { assigneeType: null, assigneeUserId: null, assigneeAgentId: null },
  });

  await prisma.cardActivity.create({
    data: {
      cardId: action.cardId,
      type: 'unassigned',
      content: 'removed assignee',
      actorId: agentId,
      actorType: 'agent',
    },
  });

  if (prevAgentId) {
    await logAgentActivity(prevAgentId, 'card_unassigned', { cardId: action.cardId, title: card.title, unassignedBy: `agent:${agentId}` });
  }

  return { ok: true, data: { id: action.cardId } };
}

async function addMember(agentId: string, action: Extract<AgentAction, { type: 'add_member' }>): Promise<ActionResult> {
  const data: any = { cardId: action.cardId };
  if (action.agentId) data.agentId = action.agentId;
  else if (action.userId) data.userId = action.userId;
  else return { ok: false, error: 'Must provide agentId or userId' };

  const member = await prisma.cardMember.create({ data });

  if (action.agentId) {
    const card = await prisma.card.findUnique({ where: { id: action.cardId }, select: { title: true } });
    await logAgentActivity(action.agentId, 'card_assigned', { cardId: action.cardId, title: card?.title, role: 'member', addedBy: `agent:${agentId}` });
  }
  if (action.userId) {
    const name = await agentDisplayName(agentId);
    await notifyCardMemberAdded({ cardId: action.cardId, userId: action.userId, actorName: name });
  }

  return { ok: true, data: { memberId: member.id } };
}

async function removeMember(agentId: string, action: Extract<AgentAction, { type: 'remove_member' }>): Promise<ActionResult> {
  if (action.agentId) {
    await prisma.cardMember.deleteMany({ where: { cardId: action.cardId, agentId: action.agentId } });
    const card = await prisma.card.findUnique({ where: { id: action.cardId }, select: { title: true } });
    await logAgentActivity(action.agentId, 'card_unassigned', { cardId: action.cardId, title: card?.title, removedBy: `agent:${agentId}` });
  } else if (action.userId) {
    await prisma.cardMember.deleteMany({ where: { cardId: action.cardId, userId: action.userId } });
  } else {
    return { ok: false, error: 'Must provide agentId or userId' };
  }

  return { ok: true };
}

async function createChecklist(agentId: string, action: Extract<AgentAction, { type: 'create_checklist' }>): Promise<ActionResult> {
  const maxPos = await prisma.checklist.aggregate({ where: { cardId: action.cardId }, _max: { position: true } });
  const checklist = await prisma.checklist.create({
    data: {
      cardId: action.cardId,
      title: action.title.trim(),
      position: (maxPos._max.position ?? -1) + 1,
    },
  });

  if (action.items?.length) {
    await prisma.checklistItem.createMany({
      data: action.items.map((content, i) => ({
        checklistId: checklist.id,
        content: content.trim(),
        position: i,
      })),
    });
  }

  await prisma.cardActivity.create({
    data: {
      cardId: action.cardId,
      type: 'checklist_added',
      content: `added checklist "${checklist.title}"`,
      actorId: agentId,
      actorType: 'agent',
    },
  });

  const items = await prisma.checklistItem.findMany({ where: { checklistId: checklist.id }, orderBy: { position: 'asc' } });

  return { ok: true, data: { checklistId: checklist.id, title: checklist.title, items: items.map((i: any) => ({ id: i.id, content: i.content })) } };
}

async function toggleChecklistItem(agentId: string, action: Extract<AgentAction, { type: 'toggle_checklist_item' }>): Promise<ActionResult> {
  const item = await prisma.checklistItem.update({
    where: { id: action.itemId },
    data: { isChecked: action.isChecked },
    include: { checklist: { select: { cardId: true } } },
  });

  await prisma.cardActivity.create({
    data: {
      cardId: item.checklist.cardId,
      type: 'checklist_item_toggled',
      content: `${action.isChecked ? 'checked' : 'unchecked'} "${item.content}"`,
      actorId: agentId,
      actorType: 'agent',
    },
  });

  return { ok: true, data: { itemId: item.id, content: item.content, isChecked: item.isChecked } };
}

async function listBoards(action: Extract<AgentAction, { type: 'list_boards' }>): Promise<ActionResult> {
  const boards = await prisma.board.findMany({
    where: { projectId: action.projectId },
    select: { id: true, name: true, columns: { select: { id: true, name: true, position: true }, orderBy: { position: 'asc' } } },
  });
  return { ok: true, data: boards };
}

async function listColumns(action: Extract<AgentAction, { type: 'list_columns' }>): Promise<ActionResult> {
  const columns = await prisma.column.findMany({
    where: { boardId: action.boardId },
    orderBy: { position: 'asc' },
    select: { id: true, name: true, position: true, color: true, _count: { select: { cards: true } } },
  });
  return { ok: true, data: columns };
}

async function listCards(action: Extract<AgentAction, { type: 'list_cards' }>): Promise<ActionResult> {
  const cards = await prisma.card.findMany({
    where: { columnId: action.columnId },
    orderBy: { position: 'asc' },
    select: {
      id: true, title: true, position: true, priority: true, labels: true, dueDate: true,
      number: true, projectId: true,
      project: { select: { cardKeyPrefix: true } },
      assigneeUser: { select: { id: true, name: true } },
      assigneeAgent: { select: { id: true, name: true, role: true } },
      _count: { select: { comments: true, checklists: true } },
    },
  });
  return { ok: true, data: cards.map(enrichCard) };
}

async function getCard(action: Extract<AgentAction, { type: 'get_card' }>): Promise<ActionResult> {
  const card = await prisma.card.findUnique({
    where: { id: action.cardId },
    include: {
      project: { select: { cardKeyPrefix: true } },
      column: { select: { id: true, name: true, board: { select: { id: true, name: true } } } },
      assigneeUser: { select: { id: true, name: true } },
      assigneeAgent: { select: { id: true, name: true, role: true } },
      members: {
        include: {
          user: { select: { id: true, name: true } },
          agent: { select: { id: true, name: true, role: true } },
        },
      },
      checklists: {
        orderBy: { position: 'asc' },
        include: { items: { orderBy: { position: 'asc' } } },
      },
      subtasks: {
        orderBy: { position: 'asc' },
        select: {
          id: true, title: true, priority: true, position: true,
          number: true, projectId: true,
          project: { select: { cardKeyPrefix: true } },
          assigneeUser: { select: { id: true, name: true } },
          assigneeAgent: { select: { id: true, name: true, role: true } },
          column: { select: { id: true, name: true } },
        },
      },
      parent: { select: { id: true, title: true, number: true, projectId: true, project: { select: { cardKeyPrefix: true } } } },
      _count: { select: { comments: true, attachments: true, activities: true, subtasks: true } },
    },
  });
  if (!card) return { ok: false, error: 'Card not found' };
  const enriched = enrichCard(card as any);
  // Subtasks and parent also benefit from key + _url.
  if (enriched.subtasks) enriched.subtasks = enriched.subtasks.map(enrichCard);
  if (enriched.parent) enriched.parent = enrichCard(enriched.parent);
  return { ok: true, data: enriched };
}

async function listSubtasks(action: Extract<AgentAction, { type: 'list_subtasks' }>): Promise<ActionResult> {
  const subtasks = await prisma.card.findMany({
    where: { parentCardId: action.cardId },
    orderBy: { position: 'asc' },
    select: {
      id: true, title: true, priority: true, position: true, dueDate: true,
      number: true, projectId: true,
      project: { select: { cardKeyPrefix: true } },
      assigneeUser: { select: { id: true, name: true } },
      assigneeAgent: { select: { id: true, name: true, role: true } },
      column: { select: { id: true, name: true } },
    },
  });
  return { ok: true, data: subtasks.map(enrichCard) };
}

async function proposeAboutUpdate(agentId: string, action: Extract<AgentAction, { type: 'propose_about_update' }>): Promise<ActionResult> {
  const agent = await prisma.aIAgent.findUnique({ where: { id: agentId }, select: { projectId: true } });
  if (!agent?.projectId) return { ok: false, error: 'Agent has no project' };
  const newText = (action.newText || '').trim();
  if (!newText) return { ok: false, error: 'newText cannot be empty' };
  const proposal = await prisma.projectAboutProposal.create({
    data: {
      projectId: agent.projectId,
      agentId,
      proposedText: newText,
      reason: (action.reason || '').trim() || null,
      status: 'pending',
    },
  });
  await logAgentActivity(agentId, 'proposed_about_update', { proposalId: proposal.id, reason: action.reason?.slice(0, 200) });
  return { ok: true, data: { proposalId: proposal.id, status: 'pending', note: 'Queued for human approval. The About section will NOT change until a project member approves this proposal.' } };
}

const PROJECT_MEMORY_KINDS = new Set(['decision', 'glossary', 'convention', 'fact']);

async function setProjectMemory(agentId: string, action: Extract<AgentAction, { type: 'set_project_memory' }>): Promise<ActionResult> {
  const agent = await prisma.aIAgent.findUnique({ where: { id: agentId }, select: { projectId: true } });
  if (!agent?.projectId) return { ok: false, error: 'Agent has no project — set_project_memory requires a project-scoped agent' };

  const key = (action.key || '').trim();
  const content = (action.content || '').trim();
  if (!key) return { ok: false, error: 'key is required' };
  if (!content) return { ok: false, error: 'content cannot be empty' };
  const kind = action.kind && PROJECT_MEMORY_KINDS.has(action.kind) ? action.kind : 'fact';

  // Note: projectId here comes from the agent's own record, NOT from the
  // action payload. There's no way for an agent to write into another
  // project's memory through this tool — the projectId is server-resolved.
  const memory = await prisma.projectMemory.upsert({
    where: { projectId_key: { projectId: agent.projectId, key } },
    create: {
      projectId: agent.projectId,
      key,
      content,
      kind,
      source: 'agent',
      writtenBy: agentId,
    },
    update: {
      content,
      kind,
      source: 'agent',
      writtenBy: agentId,
    },
  });

  // Best-effort embedding write — same pattern as agent memory + project
  // memory POST. Falls through silently when OPENAI_API_KEY is unset.
  const vec = await embedText(content);
  if (vec) {
    await prisma.$executeRaw`UPDATE "ProjectMemory" SET "embedding" = ${toVectorLiteral(vec)}::vector WHERE "id" = ${memory.id}`;
  }

  await logAgentActivity(agentId, 'project_memory_written', {
    projectId: agent.projectId,
    key: memory.key,
    kind: memory.kind,
    embedded: !!vec,
  });

  return {
    ok: true,
    data: {
      key: memory.key,
      kind: memory.kind,
      note: 'Saved to project memory. Visible to every agent in this project on their next run.',
    },
  };
}

async function startCodingTask(agentId: string, action: Extract<AgentAction, { type: 'start_coding_task' }>): Promise<ActionResult> {
  const card = await prisma.card.findUnique({
    where: { id: action.cardId },
    select: {
      id: true, title: true, assigneeAgentId: true, activeRunId: true,
      column: { select: { board: { select: { projectId: true } } } },
    },
  });
  if (!card) return { ok: false, error: 'Card not found' };
  const projectId = card.column?.board?.projectId;
  if (!projectId) return { ok: false, error: 'Project not found for card' };

  const agent = await prisma.aIAgent.findUnique({ where: { id: agentId }, select: { projectId: true } });
  if (!agent || agent.projectId !== projectId) return { ok: false, error: 'Agent does not belong to this project' };

  if (!action.force && card.assigneeAgentId !== agentId) {
    return { ok: false, error: 'Card is not assigned to you. Pass force=true only if you are confident taking this on.' };
  }
  if (card.activeRunId) return { ok: false, error: 'A coding run is already active for this card' };

  const cfg = await prisma.projectCodeConfig.findUnique({ where: { projectId } });
  if (!cfg) return { ok: false, error: 'Code automation is not configured for this project' };

  const { evaluateAndMaybeDispatch } = await import('./coding/triggers');
  const decision = await evaluateAndMaybeDispatch({
    kind: 'manual',
    cardId: card.id,
    actorAgentId: agentId,
    assigneeAgentId: card.assigneeAgentId || agentId,
  });

  if (!decision.shouldRun) return { ok: false, error: decision.reason };
  return { ok: true, data: { runId: decision.runId, cardId: card.id, mode: cfg.executionMode, note: action.notes || undefined } };
}
