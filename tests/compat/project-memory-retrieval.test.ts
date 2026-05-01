// Memory v2 / Phase 2 — keyless-fallback contract for retrieveProjectMemories.
//
// Mirrors tests/compat/agent-memory-retrieval.test.ts but for the project
// tier. The same regression risk applies: any change that makes the keyless
// path do something other than findMany would silently break Anthropic-only,
// Claude-CLI, and Codex-CLI deployments — none of which have an opt-in for
// vector retrieval.
//
// The vector path is exercised by Postgres at runtime; mocking pgvector
// would test the mock, not the system.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import dbModule from '../../src/lib/db';

delete process.env.OPENAI_API_KEY;

const seedRows = [
  { key: 'auth-location', content: 'src/lib/auth/', kind: 'convention' },
  { key: 'billing-deferred', content: 'defer to v2', kind: 'decision' },
  { key: 'tone', content: 'be direct', kind: 'preference' },
];

let findManyCalls = 0;
let activityCreateCalls = 0;
let lastFindManyArgs: any = null;

(dbModule as any).projectMemory = {
  findMany: async (args: any) => {
    findManyCalls += 1;
    lastFindManyArgs = args;
    return seedRows;
  },
  // Phase 3: bumpLastRetrievedAtProject runs after every fallback retrieval
  // so stale-detection still tracks across keyless setups.
  updateMany: async () => ({ count: 0 }),
};
(dbModule as any).agentActivityLog = {
  create: async () => {
    activityCreateCalls += 1;
    return {};
  },
};

async function loadRetrieve() {
  const { retrieveProjectMemories } = await import('../../src/lib/agentHarness');
  return retrieveProjectMemories;
}

function reset() {
  findManyCalls = 0;
  activityCreateCalls = 0;
  lastFindManyArgs = null;
}

test('keyless: undefined triggerText hits findMany fallback, returns all rows, logs nothing', async () => {
  reset();
  const retrieveProjectMemories = await loadRetrieve();
  const out = await retrieveProjectMemories('agent-1', 'project-A', undefined);
  assert.equal(findManyCalls, 1, 'must hit findMany when no trigger');
  assert.equal(activityCreateCalls, 0, 'must NOT log project_memory_retrieved on fallback');
  assert.equal(out.length, seedRows.length);
  for (const m of out) assert.equal(m.score, undefined, `${m.key} must not have a score on fallback`);
});

test('keyless: empty triggerText (whitespace only) still hits fallback', async () => {
  reset();
  const retrieveProjectMemories = await loadRetrieve();
  const out = await retrieveProjectMemories('agent-1', 'project-A', '   \n\t  ');
  assert.equal(findManyCalls, 1, 'whitespace-only trigger must take fallback branch');
  assert.equal(activityCreateCalls, 0);
  assert.equal(out.length, seedRows.length);
});

test('keyless: trigger text WITH content but no OPENAI_API_KEY hits fallback', async () => {
  reset();
  assert.equal(process.env.OPENAI_API_KEY, undefined, 'precondition: key must be unset');
  const retrieveProjectMemories = await loadRetrieve();
  const out = await retrieveProjectMemories('agent-1', 'project-A', 'how does the auth flow work?');
  assert.equal(findManyCalls, 1, 'must fall back to findMany when no API key');
  assert.equal(activityCreateCalls, 0, 'must NOT log project_memory_retrieved on fallback');
  assert.equal(out.length, seedRows.length);
});

test('fallback findMany ordering args are preserved (kind asc, updatedAt desc)', async () => {
  reset();
  const retrieveProjectMemories = await loadRetrieve();
  await retrieveProjectMemories('agent-1', 'project-A', undefined);
  // The compileHarness display layer groups by kind; preserving the ordering
  // keeps the rendered Project Memory section deterministic.
  assert.deepEqual(lastFindManyArgs?.orderBy, [{ kind: 'asc' }, { updatedAt: 'desc' }]);
  assert.equal(lastFindManyArgs?.where?.projectId, 'project-A');
});
