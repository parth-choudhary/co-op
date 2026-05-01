'use client';
import { useEffect, useState } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';

type ThemePref = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'coop-theme';

function resolveTheme(pref: ThemePref): 'light' | 'dark' {
  if (pref === 'system') {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  return pref;
}

function applyTheme(pref: ThemePref) {
  const resolved = resolveTheme(pref);
  document.documentElement.setAttribute('data-theme', resolved);
}

export default function ThemeSwitcher() {
  const [pref, setPref] = useState<ThemePref>('dark');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = (localStorage.getItem(STORAGE_KEY) as ThemePref | null) || 'system';
    setPref(stored);
    applyTheme(stored);
    setMounted(true);

    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => {
      const current = (localStorage.getItem(STORAGE_KEY) as ThemePref | null) || 'system';
      if (current === 'system') applyTheme('system');
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const choose = (p: ThemePref) => {
    setPref(p);
    localStorage.setItem(STORAGE_KEY, p);
    applyTheme(p);
  };

  if (!mounted) return null;

  const btn = (p: ThemePref, label: string, Icon: typeof Sun) => (
    <button
      key={p}
      onClick={() => choose(p)}
      title={label}
      aria-label={label}
      aria-pressed={pref === p}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 28,
        height: 28,
        borderRadius: 'var(--radius-md)',
        background: pref === p ? 'var(--color-accent-muted)' : 'transparent',
        color: pref === p ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
        transition: 'background var(--transition-fast), color var(--transition-fast)',
      }}
    >
      <Icon size={14} />
    </button>
  );

  return (
    <div
      role="group"
      aria-label="Theme"
      style={{
        position: 'fixed',
        top: 12,
        right: 16,
        zIndex: 'var(--z-sticky)' as any,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        padding: 3,
        background: 'var(--color-surface)',
        border: '1px solid var(--color-surface-border)',
        borderRadius: 'var(--radius-full)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      {btn('light', 'Light', Sun)}
      {btn('dark', 'Dark', Moon)}
      {btn('system', 'System', Monitor)}
    </div>
  );
}
