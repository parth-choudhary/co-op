// Compat test: our Plugin contract must expose a fixed surface. If someone
// accidentally renames a field, this breaks before CI ships it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listPlugins, resolveToolsForAgent, findToolByName } from '../../src/lib/plugins/registry';

test('all 7 built-in plugins are registered', () => {
  const names = listPlugins().map((p) => p.name).sort();
  assert.deepEqual(names, ['about', 'coding', 'kanban', 'scheduler', 'shell', 'skills', 'subagent']);
});

test('each plugin exposes tools with name/description/parameters/handler', () => {
  for (const p of listPlugins()) {
    for (const t of p.tools || []) {
      assert.equal(typeof t.name, 'string', `${p.name}: tool.name must be string`);
      assert.equal(typeof t.description, 'string', `${p.name}: tool.description must be string`);
      assert.equal(typeof t.parameters, 'object', `${p.name}: tool.parameters must be object`);
      assert.equal(typeof t.handler, 'function', `${p.name}: tool.handler must be a function`);
    }
  }
});

test('legacy default tool set includes kanban, scheduler, coding, about', () => {
  const tools = resolveToolsForAgent([]);
  const names = new Set(tools.map((t) => t.name));
  assert.ok(names.has('create_card'));
  assert.ok(names.has('add_comment'));
  assert.ok(names.has('start_coding_task'));
  assert.ok(names.has('schedule_task'));
  assert.ok(names.has('propose_about_update'));
});

test('empty plugin list does NOT include shell/skills/subagent by default', () => {
  const tools = resolveToolsForAgent([]);
  const names = new Set(tools.map((t) => t.name));
  assert.equal(names.has('exec_shell'), false);
  assert.equal(names.has('use_skill'), false);
  assert.equal(names.has('spawn_subagent'), false);
});

test('findToolByName resolves across plugins', () => {
  assert.ok(findToolByName('schedule_task'));
  assert.ok(findToolByName('create_card'));
  assert.ok(findToolByName('use_skill'));
  assert.equal(findToolByName('nonexistent_tool'), undefined);
});
