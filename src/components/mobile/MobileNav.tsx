'use client';
import { useState, ReactNode } from 'react';
import { Menu } from 'lucide-react';
import { Drawer } from './Drawer';

// M1 Phase 1 / Plan 01-04.3 — hamburger trigger + Drawer wrapper for the
// mobile sidebar. Sidebar consumes this at <768px.

export interface MobileNavProps {
  /** The sidebar contents. Rendered inside the Drawer when open. */
  children: ReactNode;
  /** Optional trigger label for screen readers. */
  ariaLabel?: string;
}

export function MobileNav({ children, ariaLabel = 'Open navigation' }: MobileNavProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="btn btn-ghost btn-icon"
        style={{
          minWidth: 'var(--touch-target-min)',
          minHeight: 'var(--touch-target-min)',
        }}
      >
        <Menu size={20} />
      </button>
      <Drawer open={open} onOpenChange={setOpen} ariaLabel={ariaLabel}>
        <div onClick={() => setOpen(false)} style={{ flex: 1, overflowY: 'auto' }}>
          {children}
        </div>
      </Drawer>
    </>
  );
}
