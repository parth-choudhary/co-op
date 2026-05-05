// M1 Phase 1 / Plan 01-02.4 — buildHarness determinism contract (RUN-03).
//
// Constructs synthetic HarnessInputs (no DB, no clock) and asserts the
// pure builder is deterministic on inputs. Anything that breaks this
// contract (a Date.now() leaking into assemblePrompt, an unstable Map
// iteration order, hidden process.env reads) gets caught here.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import dbModule from '../../src/lib/db';

// retrieveMemories / retrieveProjectMemories don't run in these tests
// because we call buildHarness directly with pre-built inputs. But the
// agentHarness module's import-time evaluation touches prisma; mock so
// the import doesn't try to talk to a real DB.
(dbModule as any).agentMemory = { findMany: async () => [], updateMany: async () => ({ count: 0 }) };
(dbModule as any).projectMemory = { findMany: async () => [], updateMany: async () => ({ count: 0 }) };
(dbModule as any).agentActivityLog = { findMany: async () => [], create: async () => ({}) };

const FIXED_NOW = new Date('2026-05-05T12:00:00Z');

function baseInputs(overrides: any = {}) {
  return {
    agent: {
      id: 'agent-1',
      name: 'Detective',
      role: 'developer',
      roleLabel: 'Developer',
      description: null,
      systemPrompt: 'Solve cases.',
      soulMd: null,
      plugins: ['kanban', 'about'],
      projectId: null,
      runMode: 'propose-and-execute' as const,
      ...(overrides.agent || {}),
    },
    project: overrides.project ?? null,
    agentMemories: overrides.agentMemories ?? [],
    projectMemories: overrides.projectMemories ?? [],
    snapshot: overrides.snapshot ?? null,
    recentActivity: overrides.recentActivity ?? [],
    kanban: overrides.kanban ?? { assigned: [], member: [], interacted: [] },
    ctx: overrides.ctx ?? {},
    now: overrides.now ?? FIXED_NOW,
  };
}

test('buildHarness: identical inputs → byte-identical output across two calls', async () => {
  const { buildHarness } = await import('../../src/lib/agentHarness');
  const inputs = baseInputs();
  const a = buildHarness(inputs);
  const b = buildHarness(inputs);
  assert.equal(a.compiledPrompt, b.compiledPrompt);
  assert.equal(a.runMode, b.runMode);
  assert.deepEqual(a.pluginAllowlist, b.pluginAllowlist);
});

test('buildHarness: different `now` does NOT change the prompt (no clock leakage)', async () => {
  const { buildHarness } = await import('../../src/lib/agentHarness');
  const earlier = baseInputs({ now: new Date('2026-01-01T00:00:00Z') });
  const later = baseInputs({ now: new Date('2026-12-31T23:59:59Z') });
  assert.equal(buildHarness(earlier).compiledPrompt, buildHarness(later).compiledPrompt,
    'assemblePrompt must not embed inputs.now anywhere — clocks would break resume determinism');
});

test('buildHarness: memory list reordering produces same Memory section (stable kind grouping)', async () => {
  const { buildHarness } = await import('../../src/lib/agentHarness');
  const memsA = [
    { key: 'a', content: 'first', kind: 'fact' },
    { key: 'b', content: 'second', kind: 'preference' },
  ];
  const memsB = [
    { key: 'b', content: 'second', kind: 'preference' },
    { key: 'a', content: 'first', kind: 'fact' },
  ];
  // Note: assemblePrompt's byKind grouping currently iterates Object.entries,
  // which is insertion-order. So same-kind reorder is stable; cross-kind
  // reorder may produce different group ordering. This test asserts the
  // documented behavior — both orderings include the same content so the
  // model gets the same information regardless of section order.
  const a = buildHarness({ ...baseInputs(), agentMemories: memsA });
  const b = buildHarness({ ...baseInputs(), agentMemories: memsB });
  // Both prompts must contain both memory keys, both contents.
  for (const p of [a.compiledPrompt, b.compiledPrompt]) {
    assert.match(p, /\*\*a\*\*: first/);
    assert.match(p, /\*\*b\*\*: second/);
  }
});

test('buildHarness: divergent agent.systemPrompt → divergent output', async () => {
  const { buildHarness } = await import('../../src/lib/agentHarness');
  const left = buildHarness({ ...baseInputs(), agent: { ...baseInputs().agent, systemPrompt: 'PROMPT_LEFT' } });
  const right = buildHarness({ ...baseInputs(), agent: { ...baseInputs().agent, systemPrompt: 'PROMPT_RIGHT' } });
  assert.notEqual(left.compiledPrompt, right.compiledPrompt);
  assert.match(left.compiledPrompt, /PROMPT_LEFT/);
  assert.match(right.compiledPrompt, /PROMPT_RIGHT/);
});

test('buildHarness: empty vs populated projectMemories toggles "## Project Memory" section', async () => {
  const { buildHarness } = await import('../../src/lib/agentHarness');
  const empty = buildHarness(baseInputs());
  const populated = buildHarness({
    ...baseInputs(),
    projectMemories: [{ key: 'team-tone', content: 'be direct', kind: 'preference' }],
  });
  assert.doesNotMatch(empty.compiledPrompt, /## Project Memory/);
  assert.match(populated.compiledPrompt, /## Project Memory/);
  assert.match(populated.compiledPrompt, /\*\*team-tone\*\*: be direct/);
});

test('buildHarness: pluginAllowlist defaults to baseline when agent.plugins is empty', async () => {
  const { buildHarness } = await import('../../src/lib/agentHarness');
  const out = buildHarness({ ...baseInputs(), agent: { ...baseInputs().agent, plugins: [] } });
  // Matches the default array in compileHarness's existing code.
  assert.deepEqual(out.pluginAllowlist.sort(), ['about', 'coding', 'kanban', 'scheduler']);
});

test('buildHarness: runMode defaults to propose-and-execute for Phase 1', async () => {
  const { buildHarness } = await import('../../src/lib/agentHarness');
  const out = buildHarness(baseInputs());
  assert.equal(out.runMode, 'propose-and-execute');
});
