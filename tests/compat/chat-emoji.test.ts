// Compat test for the chat emoji layer. Locks in:
//   - shortcode → emoji conversion handles node-emoji's CLDR set AND the Gemoji
//     aliases we layered on top
//   - unknown shortcodes are left untouched (no surprises in user messages)
//   - non-shortcode text is returned unchanged
//   - QUICK_EMOJIS / EMOJI_CATEGORIES are non-empty (the picker would render
//     blank if either accidentally got cleared)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emojifyShortcodes, QUICK_EMOJIS, EMOJI_CATEGORIES } from '../../src/lib/chat/emoji';

test('node-emoji shortcodes resolve', () => {
  assert.equal(emojifyShortcodes(':fire:'), '🔥');
  assert.equal(emojifyShortcodes(':rocket:'), '🚀');
  assert.equal(emojifyShortcodes(':+1:'), '👍');
});

test('Gemoji aliases we added resolve', () => {
  assert.equal(emojifyShortcodes(':thumbsup:'), '👍');
  assert.equal(emojifyShortcodes(':thumbsdown:'), '👎');
  assert.equal(emojifyShortcodes(':shipit:'), '🚢');
});

test('multiple shortcodes in one string are all replaced', () => {
  assert.equal(emojifyShortcodes(':fire: hello :rocket: :thumbsup:'), '🔥 hello 🚀 👍');
});

test('unknown shortcodes are passed through unchanged', () => {
  assert.equal(emojifyShortcodes(':not_a_real_emoji:'), ':not_a_real_emoji:');
  assert.equal(emojifyShortcodes('hi :nope: bye'), 'hi :nope: bye');
});

test('plain text is returned unchanged', () => {
  assert.equal(emojifyShortcodes('hello world'), 'hello world');
  assert.equal(emojifyShortcodes(''), '');
});

test('shortcode-looking text inside other content does not over-match', () => {
  // Email addresses contain ":" but are not shortcodes
  assert.equal(emojifyShortcodes('contact me at user@example.com'), 'contact me at user@example.com');
});

test('quick emoji bar is populated', () => {
  assert.ok(QUICK_EMOJIS.length >= 6, `expected at least 6 quick emojis, got ${QUICK_EMOJIS.length}`);
});

test('every emoji-picker category has emojis', () => {
  assert.ok(EMOJI_CATEGORIES.length > 0);
  for (const cat of EMOJI_CATEGORIES) {
    assert.ok(cat.name.length > 0, 'category name must be non-empty');
    assert.ok(cat.emojis.length > 0, `category ${cat.name} must have emojis`);
  }
});
