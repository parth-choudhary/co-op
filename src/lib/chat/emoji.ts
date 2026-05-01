// Emoji helpers for the chat layer:
//   - shortcode → emoji conversion (`:fire:` → 🔥), used both on outgoing messages
//     before they leave the composer and on incoming messages so things still render
//     even if the sender's client never expanded shortcodes.
//   - Quick-reaction set (the bar that pops out of the right-click menu).
//   - Picker categories (the larger emoji panel behind the toolbar button).
//
// Why we don't lean on node-emoji alone: it ships Unicode-CLDR shortcodes, which
// don't include several Gemoji-style aliases users actually type (`:thumbsup:`,
// `:thumbsdown:`, etc). We layer an alias table on top.

import { emojify } from 'node-emoji';

// Aliases node-emoji doesn't ship that we want to support.
const ALIAS_TO_EMOJI: Record<string, string> = {
  thumbsup: '👍',
  thumbsdown: '👎',
  shipit: '🚢',
  ship_it: '🚢',
  // Common Gemoji shortcodes for skin-toned hands without modifiers
  raised_hands: '🙌',
  facepalm: '🤦',
  shrug: '🤷',
  ok_hand: '👌',
  rocket: '🚀',
  // Make `:check:` and `:x:` natural (latter is already handled by node-emoji)
  check: '✅',
  cross: '❌',
};

// Replace `:alias:` tokens we know about, then defer to node-emoji for the rest.
// node-emoji leaves unknown tokens untouched, which is the behavior we want.
const ALIAS_RE = /:([a-zA-Z0-9_+\-]+):/g;

export function emojifyShortcodes(text: string): string {
  if (!text) return text;
  // Resolve our aliases first so we don't re-introduce a `:thumbsup:` token after
  // emojify ignores it.
  const aliased = text.replace(ALIAS_RE, (match, code: string) => {
    const lower = code.toLowerCase();
    return ALIAS_TO_EMOJI[lower] ?? match;
  });
  return emojify(aliased);
}

// Quick-reaction set used by the right-click context menu. Order matches the
// pattern users expect (positive → emotional → playful → attention).
export const QUICK_EMOJIS = [
  '👍', '😂', '😢', '😎', '❤️', '🎉', '👀', '🙏',
] as const;

// Categorized picker. Compact set — enough to feel useful without bringing in a
// full emoji-mart-sized blob. Add more here over time if the team starts asking.
export const EMOJI_CATEGORIES: Array<{ name: string; emojis: string[] }> = [
  {
    name: 'Smileys',
    emojis: [
      '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂',
      '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩',
      '😘', '😗', '😚', '😙', '😋', '😛', '😝', '😜',
      '🤪', '🤨', '🧐', '🤓', '😎', '🥸', '🤯', '😳',
      '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯',
      '😴', '🤤', '😪', '🥱', '😶', '🙄', '😬', '🤥',
    ],
  },
  {
    name: 'Gestures',
    emojis: [
      '👍', '👎', '👌', '🤌', '🤏', '✌️', '🤞', '🤟',
      '🤘', '🤙', '👈', '👉', '👆', '👇', '☝️', '✋',
      '🤚', '🖐️', '🖖', '👋', '🤝', '🙏', '👏', '🙌',
      '👐', '🤲', '🫶', '💪', '🦾', '🤳',
    ],
  },
  {
    name: 'Hearts',
    emojis: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍',
      '🤎', '💔', '❤️‍🔥', '❤️‍🩹', '💖', '💗', '💓', '💞',
      '💕', '💟', '💝', '💘', '💌',
    ],
  },
  {
    name: 'Objects',
    emojis: [
      '🔥', '✨', '🎉', '🎊', '🎁', '🏆', '🥇', '🎯',
      '💡', '📌', '📎', '🔗', '🔒', '🔑', '🛠️', '🧰',
      '⚙️', '🧪', '🧬', '🚀', '🚢', '⛵', '✈️', '🛸',
      '☕', '🍕', '🍔', '🍟', '🍿', '🍩', '🍪', '🍰',
      '🍺', '🍻', '🍷', '🥂', '🥤', '🧃',
    ],
  },
  {
    name: 'Symbols',
    emojis: [
      '✅', '❌', '⚠️', '🚫', '⛔', '🔴', '🟠', '🟡',
      '🟢', '🔵', '🟣', '⚫', '⚪', '➕', '➖', '✖️',
      '➗', '🟰', '❓', '❗', '💯', '🆗', '🆕', '🆒',
      '⬆️', '⬇️', '⬅️', '➡️', '↗️', '↘️', '↙️', '↖️',
    ],
  },
];
