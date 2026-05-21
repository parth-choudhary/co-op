/* eslint-disable @typescript-eslint/no-explicit-any, react/display-name -- this
   is a Node-test file with no React. The display-name rule misfires on the
   `$transaction = async () => ...` arrow assignment because it looks like a
   functional component. */
// Onboarding seed contract — golden assertions on what seedDemoProject creates.
// `any` is unavoidable here: we monkey-patch the Prisma singleton with hand-
// built mocks (same pattern as harness-determinism.test.ts) and the real
// Prisma client's types are too narrow for what the test needs to inject.
//
// We monkey-patch the prisma singleton (same pattern as harness-determinism.test.ts)
// rather than hitting a real DB. This keeps the test hermetic and pinpoints the
// seed's shape commitments: one project, one membership, one board, four columns,
// one dormant agent, three cards (one card assigned to the agent).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import dbModule from '../../src/lib/db';

interface CallLog {
  projectCreate?: any;
  memberCreate?: any;
  boardCreate?: any;
  columnCreates: any[];
  agentCreate?: any;
  cardCreates: any[];
  projectUpdate?: any;
}

function installMock(): CallLog {
  const log: CallLog = { columnCreates: [], cardCreates: [] };
  const noopFindFirst = async () => null;

  (dbModule as any).project = {
    findFirst: noopFindFirst,
    create: async ({ data }: any) => { log.projectCreate = data; return { id: 'proj-1', ...data }; },
    update: async (args: any) => { log.projectUpdate = args; return { id: 'proj-1' }; },
  };
  // `$transaction` runs the callback with a `tx` that has the same shape as
  // `prisma`. The real client's `tx` is a Prisma transaction proxy; for the
  // contract test we just hand back our mocked object.
  (dbModule as any).$transaction = async (fn: any) => fn({
    project: {
      create: async ({ data }: any) => { log.projectCreate = data; return { id: 'proj-1', ...data }; },
      update: async (args: any) => { log.projectUpdate = args; return { id: 'proj-1' }; },
    },
    projectMember: {
      create: async ({ data }: any) => { log.memberCreate = data; return { id: 'pm-1', ...data }; },
    },
    board: {
      create: async ({ data }: any) => { log.boardCreate = data; return { id: 'board-1', ...data }; },
    },
    column: {
      create: async ({ data }: any) => {
        const id = `col-${log.columnCreates.length}`;
        log.columnCreates.push({ id, ...data });
        return { id, ...data };
      },
    },
    aIAgent: {
      create: async ({ data }: any) => { log.agentCreate = data; return { id: 'agent-1', ...data }; },
    },
    card: {
      create: async ({ data }: any) => {
        const id = `card-${log.cardCreates.length}`;
        log.cardCreates.push({ id, ...data });
        return { id, ...data };
      },
    },
  });
  // Idempotency path reads from these directly (outside the tx), not used in
  // the green-path test below, but stubbed so the module doesn't blow up.
  (dbModule as any).aIAgent = { findFirst: async () => null };
  (dbModule as any).card = { findMany: async () => [] };
  return log;
}

test('seedDemoProject: creates project + 4 columns + dormant agent + 3 cards', async () => {
  const log = installMock();
  const { seedDemoProject } = await import('../../src/lib/onboarding/seed');
  const { DEMO_PROJECT_NAME, DEMO_AGENT_NAME, DEMO_CARDS } = await import('../../src/lib/onboarding/demoContent');

  const result = await seedDemoProject({ userId: 'user-1', companyId: 'co-1' });

  assert.equal(result.projectId, 'proj-1');
  assert.equal(result.agentId, 'agent-1');
  assert.equal(result.cardIds.length, DEMO_CARDS.length);

  // Project: must carry the canonical name + the user's company + a key prefix.
  assert.equal(log.projectCreate.name, DEMO_PROJECT_NAME);
  assert.equal(log.projectCreate.companyId, 'co-1');
  assert.ok(log.projectCreate.cardKeyPrefix, 'cardKeyPrefix must be set so cards get human keys');

  // Membership: caller is the owner.
  assert.equal(log.memberCreate.userId, 'user-1');
  assert.equal(log.memberCreate.role, 'owner');

  // Board + 4 columns.
  assert.equal(log.boardCreate.projectId, 'proj-1');
  assert.equal(log.columnCreates.length, 4);
  assert.deepEqual(log.columnCreates.map((c: any) => c.name), ['To Do', 'In Progress', 'Review', 'Done']);

  // Agent: dormant + named + within the project.
  assert.equal(log.agentCreate.name, DEMO_AGENT_NAME);
  assert.equal(log.agentCreate.isActive, false);
  assert.equal(log.agentCreate.projectId, 'proj-1');
  assert.ok(log.agentCreate.systemPrompt.length > 100, 'system prompt should be non-trivial');

  // Cards: each spec → one card; card 3 (Aria's) is agent-assigned.
  assert.equal(log.cardCreates.length, DEMO_CARDS.length);
  const ariaCard = log.cardCreates[2];
  assert.equal(ariaCard.assigneeAgentId, 'agent-1');
  assert.equal(ariaCard.assigneeType, 'agent');

  // Project counter advances past the seeded cards so the user's first manual
  // card lands on the next free slot.
  assert.equal(log.projectUpdate.data.nextCardNumber, DEMO_CARDS.length + 1);
});

test('seedDemoProject: idempotent — returns existing project id when one already exists', async () => {
  // Override the mock's findFirst to simulate an existing demo project.
  (dbModule as any).project = {
    findFirst: async () => ({ id: 'existing-proj' }),
  };
  (dbModule as any).aIAgent = { findFirst: async () => ({ id: 'existing-agent' }) };
  (dbModule as any).card = { findMany: async () => [{ id: 'c1' }, { id: 'c2' }] };
  // $transaction must NOT be called on the idempotent path.
  let txCalls = 0;
  (dbModule as any).$transaction = async () => { txCalls++; return null; };

  // Re-import to bypass the previous test's module cache holding onto a
  // different mock (Node test runner caches imports across tests in the same
  // file). The module's call site reads `prisma` lazily so the new mock wins.
  const { seedDemoProject } = await import('../../src/lib/onboarding/seed');
  const result = await seedDemoProject({ userId: 'user-1', companyId: 'co-1' });
  assert.equal(result.projectId, 'existing-proj');
  assert.equal(result.agentId, 'existing-agent');
  assert.equal(result.cardIds.length, 2);
  assert.equal(txCalls, 0, 'idempotent path must short-circuit before $transaction');
});
