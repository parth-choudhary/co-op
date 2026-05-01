import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultSessionKey, renderSessionKeyTemplate, lockIdForSession } from '../../src/lib/sessions';

test('defaultSessionKey is stable across calls', () => {
  const a = defaultSessionKey('agent1', 'discord:channel', '123', 'parth');
  const b = defaultSessionKey('agent1', 'discord:channel', '123', 'parth');
  assert.equal(a, b);
});

test('defaultSessionKey differs by sender', () => {
  const a = defaultSessionKey('agent1', 'discord:channel', '123', 'parth');
  const b = defaultSessionKey('agent1', 'discord:channel', '123', 'other');
  assert.notEqual(a, b);
});

test('renderSessionKeyTemplate interpolates nested paths', () => {
  const out = renderSessionKeyTemplate('disc:{{channel.id}}:{{author.id}}', {
    channel: { id: 'C1' },
    author: { id: 'U1' },
  });
  assert.equal(out, 'disc:C1:U1');
});

test('renderSessionKeyTemplate handles missing paths gracefully', () => {
  const out = renderSessionKeyTemplate('{{nope.absent}}', {});
  assert.equal(out, '');
});

test('lockIdForSession returns a deterministic bigint', () => {
  const a = lockIdForSession('sess:abc');
  const b = lockIdForSession('sess:abc');
  assert.equal(a, b);
  assert.equal(typeof a, 'bigint');
});
