// Compat test for card-link extraction. Locks in:
//   - bare-key recognition
//   - URL-form recognition (canonical /c/ and board ?card= forms)
//   - markdown-link wrapper collapse — `[KEY](url)` is ONE ref, not two,
//     so MessageBody renders one pill instead of `[<pill>](<pill>)`.
//
// The MD-link case is the one that regressed when the rich composer started
// serializing pasted CardMention nodes as `[KEY](url)`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractCardRefs, hasCardRef, uniqueKeysIn } from '../../src/lib/cardLinks';

test('bare key produces a single ref', () => {
  const refs = extractCardRefs('see TEST-3 please');
  assert.equal(refs.length, 1);
  assert.equal(refs[0].key, 'TEST-3');
  assert.equal(refs[0].projectId, undefined);
  assert.equal(refs[0].match, 'TEST-3');
});

test('URL form produces a single ref with projectId', () => {
  const refs = extractCardRefs('open /p/abc/c/TEST-3 to see');
  assert.equal(refs.length, 1);
  assert.equal(refs[0].key, 'TEST-3');
  assert.equal(refs[0].projectId, 'abc');
  assert.equal(refs[0].match, '/p/abc/c/TEST-3');
});

test('board-view URL also matches', () => {
  const refs = extractCardRefs('look at /p/abc/boards/main?card=TEST-3 here');
  assert.equal(refs.length, 1);
  assert.equal(refs[0].key, 'TEST-3');
  assert.equal(refs[0].projectId, 'abc');
});

test('markdown-link wrapper [KEY](url) collapses to a SINGLE ref', () => {
  // This is the regression: serializer emits `[KEY](url)` for pasted pills.
  // Before the fix this returned 2 refs (bare KEY + URL), causing the
  // renderer to show two pills with stray bracket glyphs around them.
  const refs = extractCardRefs('[TEST-3](/p/abc/c/TEST-3)this looks fire');
  assert.equal(refs.length, 1, `expected 1 ref, got ${refs.length}: ${JSON.stringify(refs)}`);
  assert.equal(refs[0].key, 'TEST-3');
  assert.equal(refs[0].projectId, 'abc');
  assert.equal(refs[0].match, '[TEST-3](/p/abc/c/TEST-3)');
  // The full match must cover the brackets/parens so the renderer replaces
  // the entire substring with one pill (no leftover `[`, `](`, `)` glyphs).
});

test('markdown-link wrapper with absolute URL also collapses', () => {
  const refs = extractCardRefs('[TEST-3](https://co-op.local/p/abc/c/TEST-3) ok');
  assert.equal(refs.length, 1);
  assert.equal(refs[0].key, 'TEST-3');
  assert.equal(refs[0].projectId, 'abc');
});

test('multiple references in one string each render once', () => {
  const refs = extractCardRefs('[TEST-3](/p/abc/c/TEST-3) and bare COOP-12 and /p/abc/c/COOP-99');
  // expected: TEST-3 (md link), COOP-12 (bare), COOP-99 (url)
  assert.equal(refs.length, 3);
  assert.deepEqual(refs.map((r) => r.key), ['TEST-3', 'COOP-12', 'COOP-99']);
});

test('uniqueKeysIn dedupes across forms', () => {
  // Same key referenced as a wrapped link AND as a bare mention later in the same body.
  const keys = uniqueKeysIn('[TEST-3](/p/abc/c/TEST-3) — recall TEST-3 again');
  assert.deepEqual(keys, ['TEST-3']);
});

test('hasCardRef is true for all three forms', () => {
  assert.equal(hasCardRef('TEST-3'), true);
  assert.equal(hasCardRef('/p/abc/c/TEST-3'), true);
  assert.equal(hasCardRef('[TEST-3](/p/abc/c/TEST-3)'), true);
  assert.equal(hasCardRef('no refs here'), false);
});

test('non-card markdown links are NOT treated as refs', () => {
  // Generic links should pass through untouched.
  const refs = extractCardRefs('see [docs](https://example.com/docs) for more');
  assert.equal(refs.length, 0);
});
