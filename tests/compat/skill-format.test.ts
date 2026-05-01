// Compat test: the ClawHub SKILL.md format is a contract we consume. If upstream
// changes the frontmatter shape, this test breaks first and loudly.
//
// Run with: npm run test:compat

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseSkillMd } from '../../src/lib/skills/loader';

const FIXTURE = readFileSync(join(__dirname, '..', 'fixtures', 'skill-canonical.md'), 'utf8');

test('canonical SKILL.md parses with full frontmatter', () => {
  const parsed = parseSkillMd(FIXTURE, 'canonical-reference');
  assert.equal(parsed.slug, 'canonical-reference');
  assert.equal(parsed.version, '1.2.3');
  assert.equal(parsed.manifest.name, 'canonical-reference');
  assert.equal(parsed.manifest.primaryEnv, 'GITHUB_TOKEN');
  assert.deepEqual(parsed.manifest.os, ['macos', 'linux']);
});

test('requires.env survives parsing', () => {
  const parsed = parseSkillMd(FIXTURE, 'x');
  const envs = parsed.manifest.metadata?.openclaw?.requires?.env;
  assert.ok(Array.isArray(envs), 'requires.env must be a list');
  assert.ok(envs!.includes('GITHUB_TOKEN'));
  assert.ok(envs!.includes('OPENAI_API_KEY'));
});

test('requires.bins survives parsing', () => {
  const parsed = parseSkillMd(FIXTURE, 'x');
  const bins = parsed.manifest.metadata?.openclaw?.requires?.bins;
  assert.ok(Array.isArray(bins));
  assert.ok(bins!.includes('curl'));
  assert.ok(bins!.includes('jq'));
});

test('missing frontmatter falls back to raw body', () => {
  const parsed = parseSkillMd('hello world', 'bareskill');
  assert.equal(parsed.slug, 'bareskill');
  assert.equal(parsed.body, 'hello world');
});

test('body is preserved after frontmatter', () => {
  const parsed = parseSkillMd(FIXTURE, 'x');
  assert.ok(parsed.body.includes('# Canonical Reference Skill'));
  assert.ok(parsed.body.includes('## Procedure'));
});
