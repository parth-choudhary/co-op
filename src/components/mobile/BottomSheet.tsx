'use client';
import { Drawer as Vaul } from 'vaul';
import { ReactNode } from 'react';

// M1 Phase 1 / Plan 01-04.3 — mobile modal replacement.
//
// Slides up from the bottom; sticky header + sticky footer + scrollable body
// between. CardDetailModal adopts this at <768px in 01-04.4; AgentHarnessModal
// + settings modals retrofit in Phase 3 / Phase 5 as their parents are touched.

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Optional primary action — rendered in the sticky footer. */
  primaryAction?: { label: string; onClick: () => void; disabled?: boolean };
  children: ReactNode;
}

export function BottomSheet({ open, onClose, title, primaryAction, children }: BottomSheetProps) {
  return (
    <Vaul.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
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
          style={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 0,
            maxHeight: '90vh',
            background: 'var(--color-bg-primary)',
            borderTop: '1px solid var(--color-surface-border)',
            borderTopLeftRadius: 'var(--radius-lg)',
            borderTopRightRadius: 'var(--radius-lg)',
            zIndex: 'var(--z-modal)' as any,
            display: 'flex',
            flexDirection: 'column',
            outline: 'none',
            paddingBottom: 'var(--safe-bottom)',
          }}
        >
          {/* Drag handle — visual affordance + tap target for vaul's
              swipe-to-dismiss gesture. */}
          <div
            aria-hidden
            style={{
              alignSelf: 'center',
              width: 36,
              height: 4,
              borderRadius: 2,
              background: 'var(--color-surface-border)',
              margin: 'var(--space-2) 0',
            }}
          />
          {/* Sticky header */}
          <header
            style={{
              padding: 'var(--space-3) var(--space-5)',
              borderBottom: '1px solid var(--color-surface-border)',
              flexShrink: 0,
            }}
          >
            <Vaul.Title
              style={{
                margin: 0,
                fontSize: 'var(--font-size-md)',
                fontWeight: 'var(--font-weight-semibold)',
                color: 'var(--color-text-primary)',
              }}
            >
              {title}
            </Vaul.Title>
          </header>
          {/* Scrollable body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-4) var(--space-5)' }}>
            {children}
          </div>
          {/* Sticky footer with primary action when provided */}
          {primaryAction && (
            <footer
              style={{
                padding: 'var(--space-3) var(--space-5)',
                borderTop: '1px solid var(--color-surface-border)',
                flexShrink: 0,
                display: 'flex',
                justifyContent: 'flex-end',
              }}
            >
              <button
                className="btn btn-primary"
                onClick={primaryAction.onClick}
                disabled={primaryAction.disabled}
                style={{ minHeight: 'var(--touch-target-min)' }}
              >
                {primaryAction.label}
              </button>
            </footer>
          )}
        </Vaul.Content>
      </Vaul.Portal>
    </Vaul.Root>
  );
}
