// Memory v2 / Phase 2 — cross-project isolation contract.
//
// API endpoint auth (membership gating in /api/projects/[id]/memory*) follows
// the existing /api/projects/[id]/secrets pattern verbatim — same assertMember
// helper, same 401/403 response shape. Endpoint-level tests would require
// mocking NextAuth's auth() helper, which isn't worth the friction here;
// deferred to integration testing against the live dev server. This file
// locks in the parts that are NEW in Phase 2 and would silently leak if a
// caller wired things wrong:
//
//   1. set_project_memory refuses an agent that has no projectId.
//   2. set_project_memory upserts ONLY into the agent's own projectId — there
//      is no input parameter that lets the model choose a target project.
//   3. retrieveProjectMemories scopes findMany by the projectId argument, not
//      by agentId, so a caller mixing up the arg order can't accidentally
//      bridge two projects.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import dbModule from '../../src/lib/db';

delete process.env.OPENAI_API_KEY;

let agentRecord: { projectId: string | null } | null = null;
let upsertCalls: any[] = [];
let projectMemoryFindManyArgs: any[] = [];
let agentActivityCreates: any[] = [];

(dbModule as any).aIAgent = {
  findUnique: async () => agentRecord,
};
(dbModule as any).projectMemory = {
  upsert: async (args: any) => {
    upsertCalls.push(args);
    return { id: 'pm_x', key: args.create.key, kind: args.create.kind };
  },
  findMany: async (args: any) => {
    projectMemoryFindManyArgs.push(args);
    return [];
  },
  updateMany: async () => ({ count: 0 }),
};
(dbModule as any).agentActivityLog = {
  create: async (args: any) => {
    agentActivityCreates.push(args);
    return {};
  },
};
(dbModule as any).agentContextSnapshot = {
  upsert: async () => ({}),
};
(dbModule as any).$executeRaw = async () => 0;

function reset() {
  agentRecord = null;
  upsertCalls = [];
  projectMemoryFindManyArgs = [];
  agentActivityCreates = [];
}

async function loadActions() {
  return import('../../src/lib/agentActions');
}
async function loadHarness() {
  return import('../../src/lib/agentHarness');
}

test('set_project_memory refuses agents that have no projectId', async () => {
  reset();
  agentRecord = { projectId: null };
  const { executeAction } = await loadActions();
  const result = await executeAction('agent-orphan', {
    type: 'set_project_memory',
    key: 'foo',
    content: 'bar',
  });
  assert.equal(result.ok, false);
  assert.match(result.error || '', /no project/i);
  assert.equal(upsertCalls.length, 0, 'no DB write should have happened');
});

test('set_project_memory upserts ONLY into the agent\'s own projectId', async () => {
  reset();
  agentRecord = { projectId: 'project-A' };
  const { executeAction } = await loadActions();
  const result = await executeAction('agent-1', {
    type: 'set_project_memory',
    key: 'auth-location',
    content: 'all auth code lives under src/lib/auth/',
    kind: 'convention',
  });
  assert.equal(result.ok, true);
  assert.equal(upsertCalls.length, 1);
  // Auth boundary lives here: projectId in the upsert MUST come from the
  // agent record, not from the action payload. There is no `projectId` field
  // on the action — but if there ever were, this assertion would catch a
  // regression where the handler honored it instead of the agent's record.
  assert.equal(upsertCalls[0].where.projectId_key.projectId, 'project-A');
  assert.equal(upsertCalls[0].create.projectId, 'project-A');
  assert.equal(upsertCalls[0].create.writtenBy, 'agent-1');
  assert.equal(upsertCalls[0].create.source, 'agent');
});

test('set_project_memory rejects empty content', async () => {
  reset();
  agentRecord = { projectId: 'project-A' };
  const { executeAction } = await loadActions();
  const result = await executeAction('agent-1', {
    type: 'set_project_memory',
    key: 'empty-test',
    content: '   ',
  });
  assert.equal(result.ok, false);
  assert.equal(upsertCalls.length, 0);
});

test('retrieveProjectMemories scopes findMany by the projectId argument, not by agentId', async () => {
  reset();
  const { retrieveProjectMemories } = await loadHarness();
  await retrieveProjectMemories('agent-1', 'project-A', undefined);
  assert.equal(projectMemoryFindManyArgs.length, 1, 'expected one findMany call on the keyless path');
  // The where clause MUST reference projectId, not agentId. A caller passing
  // an agentId by mistake (the arg shapes look similar) would leak rows from
  // any project the agent doesn't belong to — this assertion guards that.
  // Phase 3 adds `stale: false` to the same clause; we assert both fields
  // explicitly so a future refactor that drops projectId scoping is caught.
  assert.equal(projectMemoryFindManyArgs[0].where.projectId, 'project-A');
  assert.equal(projectMemoryFindManyArgs[0].where.stale, false);
  assert.equal(
    Object.prototype.hasOwnProperty.call(projectMemoryFindManyArgs[0].where, 'agentId'),
    false,
    'where clause must NOT include agentId — that would silently misroute the query',
  );
});
