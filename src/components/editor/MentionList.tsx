'use client';

// Suggestion popover for @-mentions. Rendered by TipTap's Mention extension via
// the `render` callback on `suggestion`. Standalone component so it can be
// updated by the parent (selection state etc.) — TipTap re-mounts it on
// query change.

import { forwardRef, useImperativeHandle, useState, useEffect } from 'react';

export interface MentionItem {
  id: string;
  label: string;
  /** "user" | "agent" — drives the chip badge. */
  kind: 'user' | 'agent';
  sub?: string;
}

interface Props {
  items: MentionItem[];
  command: (item: { id: string; label: string }) => void;
}

export interface MentionListHandle {
  /** Forwarded keydown — TipTap calls this so we can capture arrow / enter / tab inside the popover. */
  onKeyDown: (event: KeyboardEvent) => boolean;
}

const MentionList = forwardRef<MentionListHandle, Props>(({ items, command }, ref) => {
  const [selected, setSelected] = useState(0);

  useEffect(() => { setSelected(0); }, [items]);

  const pick = (i: number) => {
    const item = items[i];
    if (item) command({ id: item.id, label: item.label });
  };

  useImperativeHandle(ref, () => ({
    onKeyDown: (event) => {
      if (event.key === 'ArrowDown') { setSelected((s) => (s + 1) % Math.max(1, items.length)); return true; }
      if (event.key === 'ArrowUp') { setSelected((s) => (s - 1 + items.length) % Math.max(1, items.length)); return true; }
      if (event.key === 'Enter' || event.key === 'Tab') { pick(selected); return true; }
      return false;
    },
  }));

  if (items.length === 0) {
    return <div className="popover mention-popover"><div className="popover-item text-tertiary text-xs">No matches</div></div>;
  }
  return (
    <div className="popover mention-popover">
      {items.map((it, i) => (
        <div
          key={it.id}
          className={`popover-item ${i === selected ? 'selected' : ''}`}
          onMouseEnter={() => setSelected(i)}
          onMouseDown={(e) => { e.preventDefault(); pick(i); }}
        >
          <span style={{ fontWeight: 500 }}>{it.label}</span>
          {it.kind === 'agent' && <span className="badge badge-accent" style={{ marginLeft: 'auto', fontSize: 10 }}>AI</span>}
          {it.sub && <span className="text-tertiary text-xs" style={{ marginLeft: 'auto' }}>{it.sub}</span>}
        </div>
      ))}
    </div>
  );
});
MentionList.displayName = 'MentionList';

export default MentionList;
