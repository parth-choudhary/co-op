'use client';
// Right-click menu for a chat message. Two interactions:
//   - quick-react row at the top: 8 common emoji + a "more" button that opens the
//     full picker
//   - "Reply" item below that puts the message into the composer's reply state
//
// Position is controlled by the caller via { x, y } — the parent computes a
// click point and we render absolutely. We close on outside-click and on Escape.

import { useEffect, useRef, useState } from 'react';
import { Reply, ChevronDown } from 'lucide-react';
import { QUICK_EMOJIS } from '@/lib/chat/emoji';
import EmojiPicker from './EmojiPicker';

interface Props {
  x: number;
  y: number;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onClose: () => void;
}

export default function MessageContextMenu({ x, y, onReact, onReply, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    // Add listeners in a microtask so the click that opened the menu doesn't
    // immediately close it.
    const t = setTimeout(() => {
      document.addEventListener('mousedown', onDocClick);
      document.addEventListener('keydown', onKey);
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  // Clamp position so the menu doesn't render off the right/bottom edge of the
  // viewport. Width/height are approximate; the panel is small.
  const W = 320, H = 88;
  const left = Math.min(x, window.innerWidth - W - 8);
  const top = Math.min(y, window.innerHeight - H - 8);

  return (
    <div
      ref={ref}
      className="msg-context-menu"
      style={{ position: 'fixed', left, top, zIndex: 9999 }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="msg-context-quick-emojis">
        {QUICK_EMOJIS.map((e) => (
          <button
            key={e}
            type="button"
            className="msg-context-emoji-btn"
            onClick={() => { onReact(e); onClose(); }}
            title={`React with ${e}`}
          >
            {e}
          </button>
        ))}
        <button
          type="button"
          className="msg-context-emoji-btn msg-context-more"
          onClick={() => setShowPicker((v) => !v)}
          title="More emoji"
        >
          <ChevronDown size={14} />
        </button>
      </div>
      <button
        type="button"
        className="msg-context-item"
        onClick={() => { onReply(); onClose(); }}
      >
        <Reply size={14} />
        <span>Reply</span>
      </button>
      {showPicker && (
        <div className="msg-context-picker-wrap">
          <EmojiPicker
            onPick={(emoji) => { onReact(emoji); onClose(); }}
            onClose={() => setShowPicker(false)}
          />
        </div>
      )}
    </div>
  );
}
