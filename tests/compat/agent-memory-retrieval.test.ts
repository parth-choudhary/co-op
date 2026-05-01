// Phase 1 of Memory v1-v4. Locks in the keyless-fallback contract for
// retrieveMemories: when the trigger is empty or OPENAI_API_KEY is unset,
// the harness MUST behave byte-identically to the pre-vector load path —
// otherwise Anthropic-only / Claude-CLI / Codex-CLI users see regressions
// they have no opt-in for.
//
// The vector path itself is exercised by Postgres at runtime (the CTE +
// DISTINCT ON + UNION ALL is the actual ranking logic, and pgvector handles
// the cosine math). Unit-mocking it would test the mock, not the system.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import dbModule from '../../src/lib/db';

// Make sure the test process never has the key set, so embedText() returns
// null and retrieveMemories takes the fallback branch deterministically.
delete process.env.OPENAI_API_KEY;

const seedRows = [
  { key: 'pref-tone', content: 'be direct', kind: 'preference' },
  { key: 'fact-stack', content: 'Next.js 16 + React 19', kind: 'fact' },
  { key: 'decision-billing', content: 'defer billing to v2', kind: 'decision' },
];

let findManyCalls = 0;
let activityCreateCalls = 0;
let lastFindManyArgs: any = null;

(dbModule as any).agentMemory = {
  findMany: async (args: any) => {
    findManyCalls += 1;
    lastFindManyArgs = args;
    return seedRows;
  },
};
(dbModule as any).agentActivityLog = {
  create: async () => {
    activityCreateCalls += 1;
    return {};
  },
};

async function loadRetrieveMemories() {
  const { retrieveMemories } = await import('../../src/lib/agentHarness');
  return retrieveMemories;
}

function reset() {
  findManyCalls = 0;
  activityCreateCalls = 0;
  lastFindManyArgs = null;
}

test('keyless: undefined triggerText hits findMany fallback, returns all rows, logs nothing', async () => {
  reset();
  const retrieveMemories = await loadRetrieveMemories();
  const out = await retrieveMemories('agent-1', undefined);

  assert.equal(findManyCalls, 1, 'must hit findMany when no trigger');
  assert.equal(activityCreateCalls, 0, 'must NOT log memory_retrieved on fallback');
  assert.equal(out.length, seedRows.length);
  assert.deepEqual(
    out.map((m) => m.key).sort(),
    seedRows.map((m) => m.key).sort(),
  );
  // No row should carry a score in the fallback path — the harness display
  // path doesn't read score, but downstream Phase 4 audit UI will, and an
  // accidental score on a fallback row would mislead it.
  for (const m of out) assert.equal(m.score, undefined, `${m.key} must not have a score on fallback`);
});

test('keyless: empty triggerText (whitespace only) still hits fallback', async () => {
  reset();
  const retrieveMemories = await loadRetrieveMemories();
  const out = await retrieveMemories('agent-1', '   \n\t  ');
  assert.equal(findManyCalls, 1, 'whitespace-only trigger must take fallback branch');
  assert.equal(activityCreateCalls, 0);
  assert.equal(out.length, seedRows.length);
});

test('keyless: trigger text WITH content but no OPENAI_API_KEY hits fallback (keyless contract)', async () => {
  reset();
  // The whole point of Phase 1 being non-breaking: keyless setups (Anthropic-only,
  // CLI-only) get the same behavior they had before vector retrieval landed.
  assert.equal(process.env.OPENAI_API_KEY, undefined, 'precondition: key must be unset');
  const retrieveMemories = await loadRetrieveMemories();
  const out = await retrieveMemories('agent-1', 'how does the auth flow work?');
  assert.equal(findManyCalls, 1, 'must fall back to findMany when no API key');
  assert.equal(activityCreateCalls, 0, 'must NOT log memory_retrieved when fallback was taken');
  assert.equal(out.length, seedRows.length);
});

test('fallback findMany ordering args are preserved (kind asc, updatedAt desc)', async () => {
  reset();
  const retrieveMemories = await loadRetrieveMemories();
  await retrieveMemories('agent-1', undefined);
  // The display layer in compileHarness groups by kind; preserving the
  // existing orderBy keeps the rendered Memory section deterministic when
  // tests or screenshots compare full prompt strings.
  assert.deepEqual(lastFindManyArgs?.orderBy, [{ kind: 'asc' }, { updatedAt: 'desc' }]);
  assert.equal(lastFindManyArgs?.where?.agentId, 'agent-1');
});
