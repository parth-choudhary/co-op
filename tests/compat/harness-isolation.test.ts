// Regression test for the "agent comments on random member card during a chat
// DM reminder fire" bug.
//
// CONTRACT (post-design-pivot): visibility is decoupled from permission. The
// compiled harness ALWAYS includes the Kanban section so the agent can answer
// questions about its own work, regardless of how it was invoked. What the
// agent is allowed to *do* with that context is enforced by the protocol block
// (Chat / DM / Webhook / Scheduled), which must explicitly forbid card-mutating
// tools for non-card runs. This test guards both halves of that contract.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import dbModule from '../../src/lib/db';

// Monkeypatch prisma module so compileHarness doesn't touch a real DB.
const agentRow = {
  id: 'a1', name: 'CMO', role: 'cmo', roleLabel: 'CMO',
  description: null, projectId: 'p1', systemPrompt: 'Do CMO things.',
  plugins: [], skills: [], perpetual: false, scheduleCron: null,
  temperature: 0.5, modelProvider: 'anthropic', modelName: 'x',
};
const memberCard = {
  id: 'card_seo', title: 'Start SEO', priority: 'medium', dueDate: null,
  column: { name: 'In Progress', board: { name: 'Main' } },
  assigneeAgentId: null,
};

(dbModule as any).aIAgent = {
  findUnique: async () => agentRow,
};
(dbModule as any).agentMemory = { findMany: async () => [] };
(dbModule as any).agentContextSnapshot = { findUnique: async () => null };
(dbModule as any).agentActivityLog = { findMany: async () => [] };
(dbModule as any).card = {
  findMany: async () => [memberCard], // assigned
  findUnique: async () => null,
};
(dbModule as any).cardMember = {
  findMany: async () => [{ card: { ...memberCard, id: 'card_seo_member', assigneeAgentId: null } }],
};
(dbModule as any).project = {
  findUnique: async () => ({ name: 'Test Project', about: null, aboutUpdatedAt: null }),
};

async function harness() {
  const { compileHarness } = await import('../../src/lib/agentHarness');
  return compileHarness;
}

// The list of card-mutating tools the protocol must forbid for non-card runs.
// Drift this list if agentHarness.ts adds new write tools to chat/dm/cron.
const MUTATING_TOOLS = ['add_comment', 'move_card', 'update_card', 'create_card', 'assign_card'];

test('compileHarness for kind=dm includes Kanban but Chat Protocol forbids mutations', async () => {
  const compileHarness = await harness();
  const out = await compileHarness('a1', { kind: 'dm' });
  assert.ok(out.includes('## Kanban'), 'DM runs see kanban (visibility ≠ permission)');
  assert.ok(out.includes('Chat Protocol'), 'DM run must get chat protocol');
  assert.ok(out.toLowerCase().includes('no card mutations'), 'chat protocol must forbid mutations');
  for (const tool of MUTATING_TOOLS) {
    assert.ok(out.includes(tool), `chat protocol must explicitly name ${tool} as forbidden`);
  }
});

test('compileHarness for kind=chat includes Kanban but Chat Protocol forbids mutations', async () => {
  const compileHarness = await harness();
  const out = await compileHarness('a1', { kind: 'chat' });
  assert.ok(out.includes('## Kanban'));
  assert.ok(out.includes('Chat Protocol'));
  assert.ok(out.toLowerCase().includes('no card mutations'));
  for (const tool of MUTATING_TOOLS) {
    assert.ok(out.includes(tool), `chat protocol must explicitly name ${tool} as forbidden`);
  }
});

test('compileHarness for kind=cron includes Kanban but Scheduled Protocol forbids mutations', async () => {
  const compileHarness = await harness();
  const out = await compileHarness('a1', { kind: 'cron' });
  assert.ok(out.includes('## Kanban'), 'cron runs see kanban (visibility ≠ permission)');
  assert.ok(out.includes('Scheduled Protocol'), 'cron run must get scheduled protocol');
  assert.ok(out.toLowerCase().includes('must not'), 'cron protocol must forbid card-mutating tools');
  for (const tool of MUTATING_TOOLS) {
    assert.ok(out.includes(tool), `scheduled protocol must explicitly name ${tool} as forbidden`);
  }
});

test('compileHarness for kind=webhook includes Kanban but Webhook Protocol gates mutations', async () => {
  const compileHarness = await harness();
  const out = await compileHarness('a1', { kind: 'webhook' });
  assert.ok(out.includes('## Kanban'));
  assert.ok(out.includes('Webhook Protocol'));
  // Webhook is gated rather than absolute — mutations only allowed if the payload names a card.
  assert.ok(
    out.toLowerCase().includes('do not call any card-mutating tool'),
    'webhook protocol must gate card-mutating tools'
  );
});

test('compileHarness for kind=card DOES include Kanban listings', async () => {
  const compileHarness = await harness();
  const out = await compileHarness('a1', { kind: 'card', cardId: 'card_seo' });
  assert.ok(out.includes('## Kanban'), 'card runs need kanban context');
  assert.ok(out.includes('Start SEO'));
  assert.ok(out.includes('Completion Protocol'));
});

test('compileHarness when cardId is present but kind missing still includes Kanban', async () => {
  const compileHarness = await harness();
  const out = await compileHarness('a1', { cardId: 'card_seo' });
  assert.ok(out.includes('## Kanban'));
});
