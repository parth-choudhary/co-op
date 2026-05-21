import prisma from '../db';
import {
  DEMO_PROJECT_NAME,
  DEMO_PROJECT_COLOR,
  DEMO_PROJECT_KEY_PREFIX,
  DEMO_PROJECT_DESCRIPTION,
  DEMO_AGENT_NAME,
  DEMO_AGENT_ROLE,
  DEMO_AGENT_ROLE_LABEL,
  DEMO_AGENT_DESCRIPTION,
  DEMO_AGENT_SYSTEM_PROMPT,
  DEMO_AGENT_SOUL,
  DEMO_CARDS,
} from './demoContent';

// Schema-matching shape — Linear/Jira default columns mirror what the projects
// POST route creates so the demo project feels identical to a hand-rolled one.
const DEFAULT_COLUMNS = [
  { name: 'To Do',        position: 0, color: '#6b7280' },
  { name: 'In Progress',  position: 1, color: '#3b82f6' },
  { name: 'Review',       position: 2, color: '#f59e0b' },
  { name: 'Done',         position: 3, color: '#22c55e' },
];

export interface SeedDemoInput {
  userId: string;
  companyId: string;
}

export interface SeedDemoResult {
  projectId: string;
  agentId: string;
  cardIds: string[];
}

/**
 * Idempotency contract — if the user already has a project named
 * DEMO_PROJECT_NAME under the same company, we no-op and return its existing
 * ids. Lets us safely call this from register *and* from the on-demand
 * "Create demo project" button without producing duplicates.
 */
export async function findExistingDemoProject(userId: string, companyId: string): Promise<{ projectId: string } | null> {
  const found = await prisma.project.findFirst({
    where: {
      name: DEMO_PROJECT_NAME,
      companyId,
      members: { some: { userId } },
    },
    select: { id: true },
  });
  return found ? { projectId: found.id } : null;
}

/**
 * Seeds the onboarding demo project for `userId`.
 *
 * Side-effects (all inside one transaction):
 *  - Project ("Welcome to Co-Op") + ProjectMember (role: owner) for the user
 *  - Board with the 4 default columns
 *  - One demo agent (isActive: false — no Matrix provisioning here; it's a
 *    dormant placeholder until the user adds an API key)
 *  - Three demo cards across the first two columns; one assigned to the agent
 *
 * Returns the ids so the caller can deep-link the user into the demo board
 * after register. Safe to call multiple times — re-runs hit the idempotency
 * check above and short-circuit.
 *
 * Best-effort by design: the register path wraps this in try/catch so a seed
 * failure never blocks account creation.
 */
export async function seedDemoProject(input: SeedDemoInput): Promise<SeedDemoResult> {
  const existing = await findExistingDemoProject(input.userId, input.companyId);
  if (existing) {
    // Re-fetch the agent + card ids so callers always get a complete result.
    const agent = await prisma.aIAgent.findFirst({
      where: { projectId: existing.projectId, name: DEMO_AGENT_NAME },
      select: { id: true },
    });
    const cards = await prisma.card.findMany({
      where: { projectId: existing.projectId },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    return {
      projectId: existing.projectId,
      agentId: agent?.id ?? '',
      cardIds: cards.map((c: { id: string }) => c.id),
    };
  }

  // The `tx: any` matches the convention used in src/app/api/projects/route.ts
  // and the rest of the codebase — the Prisma transaction proxy type is
  // unwieldy and we don't get value from typing it narrowly here.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return prisma.$transaction(async (tx: any) => {
    const project = await tx.project.create({
      data: {
        name: DEMO_PROJECT_NAME,
        description: DEMO_PROJECT_DESCRIPTION,
        color: DEMO_PROJECT_COLOR,
        companyId: input.companyId,
        cardKeyPrefix: DEMO_PROJECT_KEY_PREFIX,
        defaultAgentShell: false,
      },
    });

    await tx.projectMember.create({
      data: { projectId: project.id, userId: input.userId, role: 'owner' },
    });

    const board = await tx.board.create({
      data: { name: 'Demo board', projectId: project.id },
    });

    // createMany doesn't return ids in MySQL/Postgres in older Prisma; create
    // each column so we can map columnIndex → columnId for the demo cards.
    const columns = await Promise.all(
      DEFAULT_COLUMNS.map((c) => tx.column.create({ data: { ...c, boardId: board.id } })),
    );

    // Dormant demo agent — isActive: false so it doesn't try to run without a
    // key. The user activates it by adding a provider key on the harness.
    const agent = await tx.aIAgent.create({
      data: {
        projectId: project.id,
        companyId: input.companyId,
        name: DEMO_AGENT_NAME,
        role: DEMO_AGENT_ROLE,
        roleLabel: DEMO_AGENT_ROLE_LABEL,
        description: DEMO_AGENT_DESCRIPTION,
        isActive: false,
        modelProvider: 'anthropic',
        modelName: 'claude-sonnet-4-20250514',
        systemPrompt: DEMO_AGENT_SYSTEM_PROMPT,
        soulMd: DEMO_AGENT_SOUL,
        soulMdUpdatedAt: new Date(),
        temperature: 0.7,
        tools: [],
        plugins: ['kanban'],
      },
    });

    // Per-project card numbers stay monotonically increasing — we increment
    // Project.nextCardNumber for each card we seed so the user's first
    // hand-created card lands on the next free slot.
    let n = 1;
    const cardIds: string[] = [];
    for (const spec of DEMO_CARDS) {
      const col = columns[spec.columnIndex];
      const card = await tx.card.create({
        data: {
          columnId: col.id,
          projectId: project.id,
          number: n,
          title: spec.title,
          description: spec.description,
          position: spec.position,
          priority: 'medium',
          labels: [],
          ...(spec.assignToDemoAgent ? { assigneeType: 'agent', assigneeAgentId: agent.id } : {}),
        },
      });
      cardIds.push(card.id);
      n += 1;
    }
    await tx.project.update({
      where: { id: project.id },
      data: { nextCardNumber: n },
    });

    return { projectId: project.id, agentId: agent.id, cardIds };
  });
}
