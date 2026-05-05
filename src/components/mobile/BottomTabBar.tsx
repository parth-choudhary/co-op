'use client';
import Link from 'next/link';
import { usePathname, useParams } from 'next/navigation';
import { ListChecks, Activity, MessageSquare } from 'lucide-react';
import styles from './BottomTabBar.module.css';

// M1 Phase 1 / Plan 01-04.5 — fixed bottom tab bar for mobile.
//
// Per CONTEXT D-04 + D-05, three tabs (Plans / Runs / Chat), all
// current-project scoped (each link is /p/<projectId>/<tab>). Hidden
// at ≥768px via the matching CSS module rule. Outside a project route,
// the tab bar is not rendered (project switcher lives in the Drawer).
//
// Adding a fourth tab here is a CONTEXT scope change — amend the phase
// plan rather than drive-by editing the array.

const TABS = [
  { key: 'plans', label: 'Plans', icon: ListChecks, hrefSegment: 'plans' },
  { key: 'runs', label: 'Runs', icon: Activity, hrefSegment: 'runs' },
  { key: 'chat', label: 'Chat', icon: MessageSquare, hrefSegment: 'chat' },
] as const;

export function BottomTabBar() {
  const params = useParams<{ projectId?: string }>();
  const pathname = usePathname();
  const projectId = params?.projectId;
  if (!projectId) return null;

  return (
    <nav role="navigation" aria-label="Primary" className={styles.bar}>
      {TABS.map((t) => {
        const href = `/p/${projectId}/${t.hrefSegment}`;
        const active = pathname === href || pathname.startsWith(href + '/');
        return (
          <Link
            key={t.key}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`${styles.tab} ${active ? styles.active : ''}`}
          >
            <t.icon size={20} />
            <span>{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
