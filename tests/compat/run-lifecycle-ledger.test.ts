// M1 Phase 1 / Plan 01-01.6 — ledger + heartbeat + diff + parallel-write contracts.
//
// Mocks prisma the same way harness-isolation.test.ts does. The SQL itself
// (the (runId, seq) UNIQUE INDEX, FK cascades, JSONB shape) is exercised
// at runtime; mocking it would test the mock.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import dbModule from '../../src/lib/db';

let agentRunEventCreates: any[] = [];
let agentTaskRunCreates: any[] = [];
let agentTaskRunUpdates: any[] = [];
let agentTaskRunFindCalls: any[] = [];
let agentActivityLogCreates: any[] = [];
let runDiffCreates: any[] = [];
let currentMaxSeq = BigInt(0);
let agentTaskRunStub: { agentId: string } | null = { agentId: 'agent-1' };

(dbModule as any).$transaction = async (cb: any) => {
  // Pass `prisma`-shaped tx to the callback so .agentRunEvent.aggregate /
  // .create work the same way they would inside a real transaction.
  return cb(dbModule);
};

(dbModule as any).agentRunEvent = {
  aggregate: async () => ({ _max: { seq: currentMaxSeq } }),
  create: async ({ data }: any) => {
    agentRunEventCreates.push(data);
    if (data.seq > currentMaxSeq) currentMaxSeq = data.seq;
    return data;
  },
};

(dbModule as any).agentTaskRun = {
  create: async ({ data }: any) => {
    agentTaskRunCreates.push(data);
    return { id: 'run-x', ...data };
  },
  update: async (args: any) => {
    agentTaskRunUpdates.push(args);
    return { id: args.where.id };
  },
  findUnique: async (args: any) => {
    agentTaskRunFindCalls.push(args);
    return agentTaskRunStub;
  },
};

(dbModule as any).agentActivityLog = {
  create: async ({ data }: any) => {
    agentActivityLogCreates.push(data);
    return data;
  },
};

(dbModule as any).runDiff = {
  create: async ({ data }: any) => {
    runDiffCreates.push(data);
    return { id: 'diff-x', ...data };
  },
};

function reset() {
  agentRunEventCreates = [];
  agentTaskRunCreates = [];
  agentTaskRunUpdates = [];
  agentTaskRunFindCalls = [];
  agentActivityLogCreates = [];
  runDiffCreates = [];
  currentMaxSeq = BigInt(0);
  agentTaskRunStub = { agentId: 'agent-1' };
}

async function loadRunEvents() {
  return import('../../src/lib/runEvents');
}
async function loadHeartbeat() {
  return import('../../src/lib/runHeartbeat');
}
async function loadRunDiffs() {
  return import('../../src/lib/runDiffs');
}

test('appendRunEvent: produces strictly-increasing seq across sequential calls', async () => {
  reset();
  const { appendRunEvent } = await loadRunEvents();
  await appendRunEvent('run-1', 'tool_call_started', { tool: 'a' });
  await appendRunEvent('run-1', 'tool_call_succeeded', { tool: 'a' });
  await appendRunEvent('run-1', 'tool_call_started', { tool: 'b' });
  assert.equal(agentRunEventCreates.length, 3);
  assert.equal(agentRunEventCreates[0].seq, BigInt(1));
  assert.equal(agentRunEventCreates[1].seq, BigInt(2));
  assert.equal(agentRunEventCreates[2].seq, BigInt(3));
});

test('startRun: creates AgentTaskRun row AND emits run_started event', async () => {
  reset();
  const { startRun } = await loadHeartbeat();
  await startRun({
    projectId: 'project-A',
    agentId: 'agent-1',
    triggerKind: 'manual',
    executionMode: 'sandbox',
  });
  assert.equal(agentTaskRunCreates.length, 1);
  assert.equal(agentTaskRunCreates[0].status, 'running');
  assert.ok(agentTaskRunCreates[0].heartbeatAt instanceof Date);
  // Run-start ledger event written with seq=1.
  assert.equal(agentRunEventCreates.length, 1);
  assert.equal(agentRunEventCreates[0].eventType, 'run_started');
  assert.equal(agentRunEventCreates[0].payload.projectId, 'project-A');
});

test('finishRun: terminates AgentTaskRun.status AND emits run_finished', async () => {
  reset();
  const { finishRun } = await loadHeartbeat();
  await finishRun('run-1', 'succeeded', 'all done');
  assert.equal(agentTaskRunUpdates.length, 1);
  assert.equal(agentTaskRunUpdates[0].data.status, 'succeeded');
  assert.equal(agentTaskRunUpdates[0].data.summaryMd, 'all done');
  assert.equal(agentRunEventCreates.length, 1);
  assert.equal(agentRunEventCreates[0].eventType, 'run_finished');
  assert.equal(agentRunEventCreates[0].payload.status, 'succeeded');
});

test('heartbeat: bumps heartbeatAt AND emits heartbeat event with empty payload', async () => {
  reset();
  const { heartbeat } = await loadHeartbeat();
  await heartbeat('run-1');
  assert.equal(agentTaskRunUpdates.length, 1);
  assert.ok(agentTaskRunUpdates[0].data.heartbeatAt instanceof Date);
  assert.equal(agentRunEventCreates.length, 1);
  assert.equal(agentRunEventCreates[0].eventType, 'heartbeat');
  assert.deepEqual(agentRunEventCreates[0].payload, {});
});

test('commitRunDiff: shapes — before:null (create), after:null (delete), both populated (update)', async () => {
  reset();
  const { commitRunDiff } = await loadRunDiffs();
  await commitRunDiff({ runId: 'r', entity: 'card', entityId: 'c1', before: null, after: { id: 'c1', title: 'new' } });
  await commitRunDiff({ runId: 'r', entity: 'card', entityId: 'c2', before: { id: 'c2', title: 'old' }, after: null });
  await commitRunDiff({ runId: 'r', entity: 'card', entityId: 'c3', before: { title: 'a' }, after: { title: 'b' } });
  assert.equal(runDiffCreates.length, 3);
  assert.equal(runDiffCreates[0].before, null);
  assert.equal(runDiffCreates[1].after, null);
  assert.ok(runDiffCreates[2].before && runDiffCreates[2].after);
});

test('parallel-write (D-07): side_effect on a card produces BOTH ledger AND legacy AgentActivityLog rows', async () => {
  reset();
  const { appendRunEvent } = await loadRunEvents();
  await appendRunEvent('run-1', 'side_effect', { entity: 'card', entityId: 'c1' });
  assert.equal(agentRunEventCreates.length, 1, 'ledger insert');
  assert.equal(agentActivityLogCreates.length, 1, 'legacy projection');
  assert.equal(agentActivityLogCreates[0].eventType, 'card_updated');
  assert.equal(agentActivityLogCreates[0].agentId, 'agent-1');
});

test('parallel-write (D-07): heartbeat event does NOT project to AgentActivityLog', async () => {
  reset();
  const { appendRunEvent } = await loadRunEvents();
  await appendRunEvent('run-1', 'heartbeat', {});
  assert.equal(agentRunEventCreates.length, 1, 'ledger insert');
  assert.equal(agentActivityLogCreates.length, 0, 'no legacy projection for runtime-only events');
});

test('parallel-write (D-07): side_effect with non-card entity skips legacy projection', async () => {
  reset();
  const { appendRunEvent } = await loadRunEvents();
  await appendRunEvent('run-1', 'side_effect', { entity: 'comment', entityId: 'cm1' });
  assert.equal(agentRunEventCreates.length, 1);
  assert.equal(agentActivityLogCreates.length, 0, 'only card side-effects map to card_updated');
});

test('parallel-write (D-07): legacy write failure does not propagate (best-effort)', async () => {
  reset();
  // Force the legacy write to throw; the ledger insert must still succeed.
  (dbModule as any).agentActivityLog.create = async () => { throw new Error('legacy DB busy'); };
  const { appendRunEvent } = await loadRunEvents();
  await assert.doesNotReject(
    appendRunEvent('run-1', 'side_effect', { entity: 'card', entityId: 'c1' }),
    'ledger write must not roll back when the dual-write target fails',
  );
  assert.equal(agentRunEventCreates.length, 1, 'ledger insert succeeded');
  // Restore for subsequent tests.
  (dbModule as any).agentActivityLog.create = async ({ data }: any) => { agentActivityLogCreates.push(data); return data; };
});
