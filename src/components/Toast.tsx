'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

type ToastKind = 'success' | 'error' | 'info';
interface ToastEntry { id: number; message: string; kind: ToastKind; }

interface ToastApi {
  push: (message: string, kind?: ToastKind, durationMs?: number) => void;
  success: (message: string, durationMs?: number) => void;
  error: (message: string, durationMs?: number) => void;
  info: (message: string, durationMs?: number) => void;
}

const Ctx = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useToast must be used inside <ToastProvider>');
  return v;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const idRef = useRef(0);

  const remove = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = useCallback((message: string, kind: ToastKind = 'info', durationMs = 3200) => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, message, kind }]);
    if (durationMs > 0) {
      setTimeout(() => remove(id), durationMs);
    }
  }, [remove]);

  const api: ToastApi = {
    push,
    success: (m, d) => push(m, 'success', d),
    error: (m, d) => push(m, 'error', d ?? 5000),
    info: (m, d) => push(m, 'info', d),
  };

  return (
    <Ctx.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        style={{
          position: 'fixed',
          bottom: 'var(--space-5)',
          right: 'var(--space-5)',
          zIndex: 'var(--z-toast)' as any,
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2)',
          maxWidth: 380,
          pointerEvents: 'none',
        }}
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} entry={t} onClose={() => remove(t.id)} />
        ))}
      </div>
    </Ctx.Provider>
  );
}

function ToastItem({ entry, onClose }: { entry: ToastEntry; onClose: () => void }) {
  const [enter, setEnter] = useState(false);
  useEffect(() => {
    const r = requestAnimationFrame(() => setEnter(true));
    return () => cancelAnimationFrame(r);
  }, []);

  const palette = entry.kind === 'success'
    ? { bg: 'var(--color-success-muted)', border: 'var(--color-success)', fg: 'var(--color-success)' }
    : entry.kind === 'error'
    ? { bg: 'rgba(251, 86, 91, 0.12)', border: 'var(--color-error)', fg: 'var(--color-error)' }
    : { bg: 'var(--color-accent-muted)', border: 'var(--color-accent)', fg: 'var(--color-accent)' };

  const Icon = entry.kind === 'success' ? CheckCircle2 : entry.kind === 'error' ? AlertCircle : Info;

  return (
    <div
      role={entry.kind === 'error' ? 'alert' : 'status'}
      style={{
        pointerEvents: 'auto',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 'var(--space-2)',
        padding: 'var(--space-3) var(--space-4)',
        background: 'var(--color-surface-elevated, var(--color-bg-secondary))',
        backdropFilter: 'blur(12px)',
        border: '1px solid var(--color-surface-border)',
        borderLeft: `3px solid ${palette.border}`,
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-lg, 0 12px 32px rgba(0,0,0,0.35))',
        color: 'var(--color-text-primary)',
        opacity: enter ? 1 : 0,
        transform: enter ? 'translateY(0)' : 'translateY(8px)',
        transition: 'opacity 160ms ease, transform 160ms ease',
        minWidth: 240,
      }}
    >
      <span style={{ color: palette.fg, marginTop: 1, display: 'flex' }}>
        <Icon size={16} />
      </span>
      <span style={{ flex: 1, fontSize: 'var(--font-size-sm)', lineHeight: 'var(--line-height-snug, 1.35)' }}>
        {entry.message}
      </span>
      <button
        onClick={onClose}
        aria-label="Dismiss"
        style={{
          color: 'var(--color-text-tertiary)',
          padding: 2,
          marginTop: 1,
          display: 'flex',
        }}
      >
        <X size={14} />
      </button>
    </div>
  );
}
