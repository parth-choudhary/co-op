// M1 Phase 1 / Plan 01-04.6 — mobile primitives contract.
//
// Locks in the structural decisions from CONTEXT D-02 / D-04 / D-08 that
// are easy to drift away from in PR reviews. Component runtime behavior
// (drawer dismiss, sheet swipe, viewport hook) is exercised by vaul's own
// tests and by manual browser smoke; this file guards the file-shape and
// token-shape contracts.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '../..');
const tokens = fs.readFileSync(path.join(root, 'src/styles/tokens.css'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/manifest.webmanifest'), 'utf8'));
const tabBarSource = fs.readFileSync(path.join(root, 'src/components/mobile/BottomTabBar.tsx'), 'utf8');

test('no /m/ mobile route tree exists (anti-pattern per research SUMMARY.md)', () => {
  const candidate = path.join(root, 'src/app/m');
  assert.equal(
    fs.existsSync(candidate),
    false,
    'src/app/m/ would be a separate mobile route tree — research SUMMARY.md flags this as an anti-pattern',
  );
});

test('tokens.css declares breakpoint + safe-area + touch-target tokens', () => {
  for (const name of ['--bp-sm', '--bp-md', '--bp-lg', '--safe-top', '--safe-right', '--safe-bottom', '--safe-left', '--touch-target-min']) {
    assert.match(tokens, new RegExp(`${name}\\s*:`, 'm'), `tokens.css must declare ${name}`);
  }
});

test('tokens.css does NOT introduce mobile-only typography overrides (CONTEXT D-02)', () => {
  // Density preserved across all breakpoints. Any @media block that overrides
  // font-size or line-height is a CONTEXT-violation and needs a phase amendment.
  // The match is intentionally loose — we look for the property declaration
  // anywhere inside any @media-prefixed block in tokens.css.
  const mediaBlockRegex = /@media\s*\([^)]*max-width[^)]*\)\s*\{[^}]*\}/g;
  const blocks = tokens.match(mediaBlockRegex) || [];
  for (const block of blocks) {
    assert.doesNotMatch(block, /font-size\s*:/, 'mobile typography override violates CONTEXT D-02 (density preserved)');
    assert.doesNotMatch(block, /line-height\s*:/, 'mobile typography override violates CONTEXT D-02 (density preserved)');
  }
});

test('manifest.webmanifest is valid JSON with single-app PWA shape (CONTEXT D-08)', () => {
  assert.equal(typeof manifest.name, 'string');
  assert.equal(typeof manifest.short_name, 'string');
  assert.equal(manifest.start_url, '/', 'single-app: start_url at root');
  assert.equal(manifest.display, 'standalone');
  assert.equal(typeof manifest.theme_color, 'string');
  assert.ok(Array.isArray(manifest.icons), 'icons must be an array');
  // Must ship at least 192 + 512 PNGs for installability.
  const sizes = manifest.icons.map((i: any) => i.sizes);
  assert.ok(sizes.includes('192x192'), 'manifest must declare a 192×192 icon');
  assert.ok(sizes.includes('512x512'), 'manifest must declare a 512×512 icon');
});

test('BottomTabBar tab list is exactly Plans / Runs / Chat (CONTEXT D-04)', () => {
  // The TABS const array drives the rendered tabs. Adding a fourth tab is
  // a scope change that needs to amend the phase plan, not a drive-by edit.
  assert.match(tabBarSource, /label:\s*'Plans'/);
  assert.match(tabBarSource, /label:\s*'Runs'/);
  assert.match(tabBarSource, /label:\s*'Chat'/);
  // Lock count: search for `label: '...'` declarations inside the TABS array.
  const labelMatches = tabBarSource.match(/label:\s*'[^']+'/g) || [];
  assert.equal(labelMatches.length, 3, 'BottomTabBar TABS array must declare exactly 3 tabs');
});

test('BottomTabBar links into project-scoped routes', () => {
  // hrefSegment values become /p/<projectId>/<segment> via the Link href.
  // Locking the segment names guards against accidental rename.
  assert.match(tabBarSource, /hrefSegment:\s*'plans'/);
  assert.match(tabBarSource, /hrefSegment:\s*'runs'/);
  assert.match(tabBarSource, /hrefSegment:\s*'chat'/);
});
