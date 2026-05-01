import prisma from '@/lib/db';

// Compiles a human+machine-readable markdown brief for the sandbox agent.
// The sandbox agent (Claude Code / aider) consumes this verbatim as its task.
export async function compileBrief(runId: string): Promise<string> {
  const run = await prisma.agentTaskRun.findUnique({
    where: { id: runId },
    include: {
      project: {
        select: {
          name: true, about: true,
          codeConfig: { select: { repoFullName: true, defaultBranch: true, stagingBranch: true, mergePolicy: true } },
        },
      },
    },
  });
  if (!run) throw new Error('Run not found');

  const [card, agent, comments, checklists] = await Promise.all([
    prisma.card.findUnique({
      where: { id: run.cardId },
      include: {
        column: { select: { name: true, board: { select: { name: true } } } },
        members: {
          include: {
            user: { select: { name: true } },
            agent: { select: { name: true, roleLabel: true } },
          },
        },
      },
    }),
    prisma.aIAgent.findUnique({
      where: { id: run.agentId },
      select: { name: true, roleLabel: true, role: true, systemPrompt: true },
    }),
    prisma.comment.findMany({
      where: { cardId: run.cardId },
      orderBy: { createdAt: 'asc' },
      take: 50,
      include: { author: { select: { name: true } } },
    }),
    prisma.checklist.findMany({
      where: { cardId: run.cardId },
      orderBy: { position: 'asc' },
      include: { items: { orderBy: { position: 'asc' } } },
    }),
  ]);
  if (!card) throw new Error('Card not found');

  // Enrich agent-authored comments
  const agentAuthorIds = [...new Set(comments.filter((c: any) => c.authorType === 'agent').map((c: any) => c.authorId))];
  const agentMap = agentAuthorIds.length
    ? Object.fromEntries(
        (await prisma.aIAgent.findMany({ where: { id: { in: agentAuthorIds } }, select: { id: true, name: true } })).map((a: any) => [a.id, a.name])
      )
    : {};

  const out: string[] = [];
  out.push(`# ${card.title}`);
  out.push('');
  out.push(`**Project:** ${run.project?.name ?? ''} · **Board:** ${card.column?.board?.name ?? ''} · **Column:** ${card.column?.name ?? ''}`);
  if (agent) out.push(`**Assigned agent:** ${agent.name} (${agent.roleLabel})`);
  out.push(`**Repository:** ${run.project?.codeConfig?.repoFullName ?? '(not configured)'} · **Base branch:** ${run.project?.codeConfig?.defaultBranch ?? 'main'}`);
  out.push(`**Merge policy:** ${run.project?.codeConfig?.mergePolicy ?? 'human_pr'}`);
  out.push(`**Run ID:** \`${run.id}\` · **Target branch:** \`coop/run-${run.id}\``);
  out.push('');

  if (run.project?.about) {
    out.push('## Project context');
    out.push(run.project.about.trim());
    out.push('');
  }

  if (agent?.systemPrompt) {
    out.push(`## Agent role: ${agent.roleLabel}`);
    out.push(agent.systemPrompt.trim());
    out.push('');
  }

  out.push('## Task description');
  out.push((card.description?.trim() || '_(no description provided)_'));
  out.push('');

  if (checklists.length > 0) {
    out.push('## Acceptance criteria');
    for (const cl of checklists) {
      out.push(`### ${cl.title}`);
      for (const it of cl.items) out.push(`- [${it.isChecked ? 'x' : ' '}] ${it.content}`);
      out.push('');
    }
  }

  const humanMembers = card.members.filter((m: any) => m.user).map((m: any) => m.user.name);
  const agentMembers = card.members.filter((m: any) => m.agent).map((m: any) => `${m.agent.name} (${m.agent.roleLabel})`);
  if (humanMembers.length || agentMembers.length) {
    out.push('## Collaborators on this card');
    if (humanMembers.length) out.push(`- Humans: ${humanMembers.join(', ')}`);
    if (agentMembers.length) out.push(`- Agents: ${agentMembers.join(', ')}`);
    out.push('');
  }

  if (comments.length > 0) {
    out.push('## Discussion');
    for (const c of comments) {
      const name = c.authorType === 'agent' ? (agentMap[c.authorId] || 'Agent') : (c.author?.name || 'User');
      const tag = c.authorType === 'agent' ? ` (agent)` : '';
      out.push(`**${name}${tag}** — ${new Date(c.createdAt).toISOString()}`);
      out.push(c.content.trim());
      out.push('');
    }
  }

  out.push('## What you must do');
  out.push(`1. Make the smallest reasonable set of changes that satisfy the task description and acceptance criteria.`);
  out.push(`2. Commit your changes on branch \`coop/run-${run.id}\` off of \`${run.project?.codeConfig?.defaultBranch ?? 'main'}\`.`);
  out.push(`3. Open a pull request with a title that starts with \`[co-op] ${card.title}\` and a body that summarises the diff and references this run (\`runId=${run.id}\`).`);
  out.push(`4. Do not modify unrelated code. If the task is ambiguous or impossible, open the PR anyway with an explanation in the body and mark it as draft.`);
  out.push(`5. Do not merge. The co-op app and the project's merge policy will handle that.`);

  return out.join('\n');
}
