'use client';
import { Drawer as Vaul } from 'vaul';
import { ReactNode } from 'react';

// M1 Phase 1 / Plan 01-04.3 — left-anchored mobile sidebar drawer.
//
// Wraps vaul's Drawer for the sidebar replacement at <768px. Vaul handles
// backdrop dismiss, ESC, swipe-to-close, prefers-reduced-motion via
// framer-motion under the hood. Direction='left' for sidebar UX (slides
// in from the leading edge).

export interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  /** Optional ARIA label for the dialog region. */
  ariaLabel?: string;
}

export function Drawer({ open, onOpenChange, children, ariaLabel = 'Navigation' }: DrawerProps) {
  return (
    <Vaul.Root open={open} onOpenChange={onOpenChange} direction="left">
      <Vaul.Portal>
        <Vaul.Overlay
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.6)',
            zIndex: 'var(--z-modal)' as any,
          }}
        />
        <Vaul.Content
          aria-label={ariaLabel}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            bottom: 0,
            width: 'min(85vw, 320px)',
            background: 'var(--color-bg-primary)',
            borderRight: '1px solid var(--color-surface-border)',
            zIndex: 'var(--z-modal)' as any,
            paddingTop: 'var(--safe-top)',
            paddingBottom: 'var(--safe-bottom)',
            paddingLeft: 'var(--safe-left)',
            outline: 'none',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Vaul requires a Title for a11y. Hidden visually; consumers can
              render their own header inside `children` if needed. */}
          <Vaul.Title style={{ position: 'absolute', left: -10000, width: 1, height: 1, overflow: 'hidden' }}>
            {ariaLabel}
          </Vaul.Title>
          {children}
        </Vaul.Content>
      </Vaul.Portal>
    </Vaul.Root>
  );
}
