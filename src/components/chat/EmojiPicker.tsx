'use client';
// Compact, dependency-free emoji picker. Categorized list lives in
// src/lib/chat/emoji.ts. Two callsites use this component:
//   - the composer toolbar (broad picker, inserts into the input)
//   - reaction selectors (reuse the same panel; pick = react)
//
// Positioning is the caller's job — this is just the panel. Wrap it in a
// position:absolute container in the parent.

import { useState } from 'react';
import { EMOJI_CATEGORIES } from '@/lib/chat/emoji';

interface Props {
  onPick: (emoji: string) => void;
  onClose?: () => void;
}

export default function EmojiPicker({ onPick, onClose }: Props) {
  const [tab, setTab] = useState(0);
  const cat = EMOJI_CATEGORIES[tab];

  return (
    <div className="emoji-picker" onClick={(e) => e.stopPropagation()}>
      <div className="emoji-picker-tabs">
        {EMOJI_CATEGORIES.map((c, i) => (
          <button
            key={c.name}
            type="button"
            className={`emoji-picker-tab ${i === tab ? 'active' : ''}`}
            onClick={() => setTab(i)}
            title={c.name}
          >
            {c.emojis[0]}
          </button>
        ))}
      </div>
      <div className="emoji-picker-grid">
        {cat.emojis.map((e) => (
          <button
            key={e}
            type="button"
            className="emoji-picker-emoji"
            onClick={() => { onPick(e); onClose?.(); }}
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}
