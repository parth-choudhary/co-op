// TipTap input rule that turns `:shortcode: ` into the corresponding emoji as
// the user types. Mirrors the on-send conversion in lib/chat/emoji.ts so the
// editor view matches what eventually gets sent.
//
// Triggers on a trailing whitespace character — typing `:fire:` and then space
// fires the rule and replaces the whole match with `🔥 `. Unknown shortcodes
// are left alone (the user might be quoting a pasted token).
//
// We intentionally don't match on Enter — Enter usually means "submit," and the
// send path will emojify any leftover shortcodes there.

import { Extension, InputRule } from '@tiptap/core';
import { emojifyShortcodes } from '@/lib/chat/emoji';

const SHORTCODE_RE = /:([a-zA-Z0-9_+\-]+):\s$/;

export const EmojiInputRule = Extension.create({
  name: 'emojiInputRule',
  addInputRules() {
    return [
      new InputRule({
        find: SHORTCODE_RE,
        handler: ({ range, match, chain }) => {
          const full = match[0];                  // e.g. ":fire: "
          const shortcode = full.slice(0, -1);    // ":fire:"
          const emoji = emojifyShortcodes(shortcode);
          // emojifyShortcodes returns the same string when nothing matched —
          // bail out so we don't burn an undo step replacing text with itself.
          if (emoji === shortcode) return null;
          chain()
            .deleteRange({ from: range.from, to: range.to })
            .insertContent(emoji + ' ')
            .run();
        },
      }),
    ];
  },
});
