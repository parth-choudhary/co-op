// Compat test: the AgentRuntime contract shape is stable. Anything that removes
// or renames a field here is a breaking change to every runtime implementation.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AgentRuntime, AgentSpec, RunSpec, RuntimePorts } from '../../src/lib/runtime/contract';

test('AgentSpec has the 11 expected fields', () => {
  const spec: AgentSpec = {
    id: 'a', projectId: null, name: 'n', role: 'cmo', roleLabel: 'CMO',
    description: null, systemPrompt: '', modelProvider: 'anthropic',
    modelName: 'claude-sonnet-4-6', temperature: 0.5,
    plugins: [], skills: [], perpetual: false, scheduleCron: null,
  };
  const keys = Object.keys(spec).sort();
  assert.deepEqual(keys, [
    'description', 'id', 'modelName', 'modelProvider', 'name',
    'perpetual', 'plugins', 'projectId', 'role', 'roleLabel',
    'scheduleCron', 'skills', 'systemPrompt', 'temperature',
  ]);
});

test('RunSpec carries harnessKind enum values we wire through today', () => {
  const kinds: NonNullable<RunSpec['harnessKind']>[] = ['card', 'chat', 'dm', 'webhook', 'cron', 'manual'];
  // Compile-time only; assertion just forces the values to exist.
  assert.equal(kinds.length, 6);
});

test('RuntimePorts surface — presence check', () => {
  const ports: RuntimePorts = {
    getApiKey: async () => null,
    compileSystemPrompt: async () => '',
    resolveTools: () => [],
    dispatchTool: async () => ({ ok: true }),
    log: () => {},
  };
  assert.equal(typeof ports.getApiKey, 'function');
  assert.equal(typeof ports.compileSystemPrompt, 'function');
  assert.equal(typeof ports.resolveTools, 'function');
  assert.equal(typeof ports.dispatchTool, 'function');
  assert.equal(typeof ports.log, 'function');
});

test('AgentRuntime has name/version/capabilities/invoke', () => {
  const rt: AgentRuntime = {
    name: 'fake', version: '0.0.0',
    capabilities: () => ({ streaming: false, tools: true, providers: ['anthropic'] }),
    invoke: async () => ({ text: '', provider: 'anthropic', model: 'x', runtime: 'fake' }),
  };
  assert.equal(rt.name, 'fake');
  assert.equal(typeof rt.invoke, 'function');
  assert.deepEqual(rt.capabilities().providers, ['anthropic']);
});

test('native runtime is registered and advertises expected providers', async () => {
  const { getRuntime, listRuntimes } = await import('../../src/lib/runtime/registry');
  await import('../../src/lib/runtime/native');
  const native = getRuntime('native');
  assert.ok(native, 'native runtime must be registered');
  assert.equal(native!.name, 'native');
  const caps = native!.capabilities();
  assert.ok(caps.providers.includes('anthropic'));
  assert.ok(caps.providers.includes('openai'));
  assert.equal(caps.tools, true);
  const names = listRuntimes().map((r) => r.name);
  assert.ok(names.includes('native'));
});
