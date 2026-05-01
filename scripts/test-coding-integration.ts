// DB-backed integration test for the trigger evaluator + dispatch happy/sad paths.
// Requires: docker compose up db (port 5433). Cleans up after itself.
//
// Run: npx tsx scripts/test-coding-integration.ts

import assert from 'node:assert/strict';
process.env.GITHUB_APP_WEBHOOK_SECRET ||= 'test-webhook-secret';
process.env.COOP_WORKER_SECRET ||= 'test-worker-secret';
process.env.APP_BASE_URL ||= 'http://localhost:3000';

import prisma from '../src/lib/db';
import { evaluateAndMaybeDispatch, commentHasStartIntent } from '../src/lib/coding/triggers';
import { dispatchRun } from '../src/lib/coding/dispatch';
import { compileBrief } from '../src/lib/coding/brief';

const SUFFIX = `it_${Date.now()}`;
const ids: { companyId?: string; userId?: string; projectId?: string; agentId?: string; boardId?: string; colA?: string; colB?: string; cardId?: string } = {};

async function setup() {
  const company = await prisma.company.create({ data: { name: `Test ${SUFFIX}` } });
  ids.companyId = company.id;
  const user = await prisma.user.create({ data: {
    companyId: company.id, email: `${SUFFIX}@test.local`, name: 'Tester', passwordHash: 'x',
  }});
  ids.userId = user.id;
  const project = await prisma.project.create({ data: { companyId: company.id, name: `Proj ${SUFFIX}` } });
  ids.projectId = project.id;
  await prisma.projectMember.create({ data: { projectId: project.id, userId: user.id, role: 'owner' } });
  const agent = await prisma.aIAgent.create({ data: {
    projectId: project.id, name: 'Coder', role: 'developer', roleLabel: 'Developer',
    modelProvider: 'anthropic', modelName: 'claude-opus-4-6', systemPrompt: 'You write code.',
  }});
  ids.agentId = agent.id;
  const board = await prisma.board.create({ data: { projectId: project.id, name: 'Main' } });
  ids.boardId = board.id;
  const colA = await prisma.column.create({ data: { boardId: board.id, name: 'Todo', position: 0 } });
  const colB = await prisma.column.create({ data: { boardId: board.id, name: 'In Progress', position: 1 } });
  ids.colA = colA.id; ids.colB = colB.id;
  const card = await prisma.card.create({ data: {
    columnId: colA.id, title: 'Add /healthz route', description: 'Return 200 OK at /healthz',
    position: 0, assigneeAgentId: agent.id, assigneeType: 'agent',
  }});
  ids.cardId = card.id;
}

async function teardown() {
  if (ids.companyId) await prisma.company.delete({ where: { id: ids.companyId } }).catch(() => {});
}

const cases: Array<[string, () => Promise<void>]> = [];
function test(name: string, fn: () => Promise<void>) { cases.push([name, fn]); }

test('evaluator: rejects when no project config', async () => {
  const d = await evaluateAndMaybeDispatch({ kind: 'manual', cardId: ids.cardId! });
  assert.equal(d.shouldRun, false);
  assert.match(d.reason, /not configured/);
});

test('evaluator: rejects when triggers off', async () => {
  await prisma.projectCodeConfig.upsert({
    where: { projectId: ids.projectId! },
    create: {
      projectId: ids.projectId!, executionMode: 'github_actions', mergePolicy: 'human_pr',
      defaultBranch: 'main', triggerOnManual: false, triggerOnColumnMove: false,
      triggerOnAssign: false, triggerOnComment: false,
    },
    update: { triggerOnManual: false, triggerOnColumnMove: false, triggerOnAssign: false, triggerOnComment: false },
  });
  const d = await evaluateAndMaybeDispatch({ kind: 'manual', cardId: ids.cardId! });
  assert.equal(d.shouldRun, false);
  assert.match(d.reason, /manual trigger disabled/);
});

test('evaluator: column_move only fires for trigger column', async () => {
  await prisma.projectCodeConfig.update({
    where: { projectId: ids.projectId! },
    data: { triggerOnColumnMove: true, triggerColumnIds: [ids.colB!] },
  });
  const wrong = await evaluateAndMaybeDispatch({ kind: 'column_move', cardId: ids.cardId!, toColumnId: ids.colA! });
  assert.equal(wrong.shouldRun, false);
  assert.match(wrong.reason, /not a trigger column/);
});

test('evaluator: column_move matches any of multiple trigger columns (no config)', async () => {
  // Set trigger columns to include both A and B, then verify each matches.
  await prisma.projectCodeConfig.update({
    where: { projectId: ids.projectId! },
    data: { triggerOnColumnMove: true, triggerColumnIds: [ids.colA!, ids.colB!] },
  });
  // Use a fresh card with no agent so the evaluator will short-circuit AFTER
  // trigger-column matching (on the "card has no agent" check). This lets us
  // assert the column matched without actually dispatching.
  const card = await prisma.card.create({ data: {
    columnId: ids.colA!, title: 'No agent', description: 'x', position: 20,
  }});
  const a = await evaluateAndMaybeDispatch({ kind: 'column_move', cardId: card.id, toColumnId: ids.colA! });
  assert.equal(a.shouldRun, false);
  assert.match(a.reason, /has no agent/);
  const b = await evaluateAndMaybeDispatch({ kind: 'column_move', cardId: card.id, toColumnId: ids.colB! });
  assert.equal(b.shouldRun, false);
  assert.match(b.reason, /has no agent/);
});

test('evaluator: comment without start-intent does not fire', async () => {
  await prisma.projectCodeConfig.update({
    where: { projectId: ids.projectId! },
    data: { triggerOnComment: true },
  });
  const d = await evaluateAndMaybeDispatch({
    kind: 'comment', cardId: ids.cardId!, commentText: '@coder thanks for the update', commentAuthorType: 'user',
  });
  assert.equal(d.shouldRun, false);
  assert.match(d.reason, /no start intent/);
});

test('evaluator: comment with start-intent claims and dispatches (fails on missing GH env)', async () => {
  // dispatchRun will fail because GITHUB_APP_ID is unset — the run row should
  // end up failed with errorMessage and Card.activeRunId cleared.
  delete process.env.GITHUB_APP_ID;
  delete process.env.GITHUB_APP_PRIVATE_KEY;

  // Make sure the card is on the trigger column so column gating is irrelevant.
  // Use a fresh card to avoid race with the previous test residue.
  const card = await prisma.card.create({ data: {
    columnId: ids.colA!, title: 'Bug fix', description: 'Fix it', position: 1,
    assigneeAgentId: ids.agentId!, assigneeType: 'agent',
  }});
  const d = await evaluateAndMaybeDispatch({
    kind: 'comment', cardId: card.id,
    commentText: '@coder go', commentAuthorType: 'user', actorUserId: ids.userId!,
  });
  assert.equal(d.shouldRun, true, 'should claim');
  assert.ok(d.runId);
  // Wait briefly for fire-and-forget dispatch to land.
  await new Promise((r) => setTimeout(r, 300));
  const run = await prisma.agentTaskRun.findUnique({ where: { id: d.runId! } });
  assert.ok(run, 'run row created');
  assert.equal(run!.status, 'failed', `expected failed (no GH env), got ${run!.status}`);
  assert.match(run!.errorMessage || '', /GitHub App|GITHUB_APP/);
  const after = await prisma.card.findUnique({ where: { id: card.id } });
  assert.equal(after!.activeRunId, null, 'activeRunId cleared after failed dispatch');
});

test('evaluator: refuses to claim when activeRunId already set', async () => {
  const card = await prisma.card.create({ data: {
    columnId: ids.colA!, title: 'Already running', description: 'x', position: 2,
    assigneeAgentId: ids.agentId!, assigneeType: 'agent', activeRunId: 'fake-run-id',
  }});
  const d = await evaluateAndMaybeDispatch({ kind: 'manual', cardId: card.id });
  assert.equal(d.shouldRun, false);
  assert.match(d.reason, /already active/);
});

test('compileBrief: produces markdown with task + agent + repo info', async () => {
  // Need a real run to compile against.
  const cfg = await prisma.projectCodeConfig.findUnique({ where: { projectId: ids.projectId! } });
  await prisma.projectCodeConfig.update({
    where: { projectId: ids.projectId! },
    data: { repoFullName: 'acme/web' },
  });
  const card = await prisma.card.create({ data: {
    columnId: ids.colA!, title: 'Brief test', description: 'Add a footer to README.', position: 3,
    assigneeAgentId: ids.agentId!, assigneeType: 'agent',
  }});
  await prisma.checklist.create({ data: { cardId: card.id, title: 'Acceptance', position: 0,
    items: { create: [{ content: 'README footer line present', position: 0 }] },
  } as any });
  await prisma.comment.create({ data: { cardId: card.id, content: 'please match house style', authorType: 'user', authorId: ids.userId! } });
  const run = await prisma.agentTaskRun.create({ data: {
    projectId: ids.projectId!, cardId: card.id, agentId: ids.agentId!,
    triggerKind: 'manual', executionMode: 'github_actions', status: 'queued',
  }});
  const brief = await compileBrief(run.id);
  assert.match(brief, /# Brief test/);
  assert.match(brief, /Repository.*acme\/web/);
  assert.match(brief, /coop\/run-/);
  assert.match(brief, /Add a footer to README/);
  assert.match(brief, /README footer line present/);
  assert.match(brief, /please match house style/);
});

test('dispatchRun: local_git refused when COOP_LOCAL_MODE is off', async () => {
  delete process.env.COOP_LOCAL_MODE;
  await prisma.projectCodeConfig.update({
    where: { projectId: ids.projectId! },
    data: { executionMode: 'local_git', localRepoPath: '/tmp/irrelevant' },
  });
  const card = await prisma.card.create({ data: {
    columnId: ids.colA!, title: 'Local mode off', description: 'x', position: 10,
    assigneeAgentId: ids.agentId!, assigneeType: 'agent',
  }});
  const run = await prisma.agentTaskRun.create({ data: {
    projectId: ids.projectId!, cardId: card.id, agentId: ids.agentId!,
    triggerKind: 'manual', executionMode: 'local_git', status: 'queued',
  }});
  await prisma.card.update({ where: { id: card.id }, data: { activeRunId: run.id } });
  await assert.rejects(() => dispatchRun(run.id), /Local-git mode is disabled/);
  const after = await prisma.agentTaskRun.findUnique({ where: { id: run.id } });
  assert.equal(after!.status, 'failed');
  const cardAfter = await prisma.card.findUnique({ where: { id: card.id } });
  assert.equal(cardAfter!.activeRunId, null);
});

test('dispatchRun: local_git refused when localRepoPath unset', async () => {
  process.env.COOP_LOCAL_MODE = '1';
  await prisma.projectCodeConfig.update({
    where: { projectId: ids.projectId! },
    data: { executionMode: 'local_git', localRepoPath: null },
  });
  const card = await prisma.card.create({ data: {
    columnId: ids.colA!, title: 'No path', description: 'x', position: 11,
    assigneeAgentId: ids.agentId!, assigneeType: 'agent',
  }});
  const run = await prisma.agentTaskRun.create({ data: {
    projectId: ids.projectId!, cardId: card.id, agentId: ids.agentId!,
    triggerKind: 'manual', executionMode: 'local_git', status: 'queued',
  }});
  await prisma.card.update({ where: { id: card.id }, data: { activeRunId: run.id } });
  await assert.rejects(() => dispatchRun(run.id), /localRepoPath/);
});

test('dispatchRun: fails cleanly with no GH env, restores card', async () => {
  delete process.env.GITHUB_APP_ID;
  const card = await prisma.card.create({ data: {
    columnId: ids.colA!, title: 'Direct dispatch', description: 'x', position: 4,
    assigneeAgentId: ids.agentId!, assigneeType: 'agent',
  }});
  const run = await prisma.agentTaskRun.create({ data: {
    projectId: ids.projectId!, cardId: card.id, agentId: ids.agentId!,
    triggerKind: 'manual', executionMode: 'github_actions', status: 'queued',
  }});
  await prisma.card.update({ where: { id: card.id }, data: { activeRunId: run.id } });
  await assert.rejects(() => dispatchRun(run.id), /GitHub App|GITHUB_APP/);
  const after = await prisma.agentTaskRun.findUnique({ where: { id: run.id } });
  assert.equal(after!.status, 'failed');
  const cardAfter = await prisma.card.findUnique({ where: { id: card.id } });
  assert.equal(cardAfter!.activeRunId, null);
});

(async () => {
  // Sanity check this matches the unit test
  assert.equal(commentHasStartIntent('@x start'), true);

  await setup();
  let pass = 0, fail = 0;
  try {
    for (const [name, fn] of cases) {
      try {
        await fn();
        console.log(`✓ ${name}`);
        pass++;
      } catch (err: any) {
        console.error(`✗ ${name}\n  ${err?.message || err}`);
        fail++;
      }
    }
  } finally {
    await teardown();
    await prisma.$disconnect();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
