// Light smoke test: the ClawHub public HTTP API is the only thing we call by
// name. If they rename `/api/v1/search` or the result shape, install breaks.
//
// Runs only when CLAWHUB_SMOKE=1 is set — CI should set this on a schedule,
// not on every PR (don't hit their rate limit).

import { test } from 'node:test';
import assert from 'node:assert/strict';

const ENABLED = process.env.CLAWHUB_SMOKE === '1';

test('ClawHub /api/v1/search is reachable', { skip: !ENABLED }, async () => {
  const r = await fetch('https://clawhub.ai/api/v1/search?q=github&limit=3');
  assert.equal(r.ok, true, `expected 200, got ${r.status}`);
  const j: any = await r.json();
  const items = Array.isArray(j) ? j : (j.results || j.items || j.skills || []);
  assert.ok(items.length > 0, 'search returned empty');
  const first = items[0];
  assert.ok(first.slug || first.name, 'result missing slug/name — shape drifted');
});

test('ClawHub /api/v1/skills/:slug/file returns SKILL.md', { skip: !ENABLED }, async () => {
  // Pick a well-known popular skill that should remain installed for a while.
  const r = await fetch('https://clawhub.ai/api/v1/skills/todoist/file?path=SKILL.md');
  if (r.status === 404) {
    console.warn('  (reference skill "todoist" not present — adjust fixture)');
    return;
  }
  assert.equal(r.ok, true, `expected 200, got ${r.status}`);
  const txt = await r.text();
  assert.ok(txt.includes('---'), 'expected YAML frontmatter fence');
});
