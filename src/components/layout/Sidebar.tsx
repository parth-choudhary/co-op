'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, Columns3, MessageSquare, Bot, Settings, Users,
  ChevronLeft, ChevronRight, Plus, LogOut, Check, ChevronsUpDown,
  FolderKanban, Search, X, Bell,
} from 'lucide-react';
import CoOpLogo from '@/components/CoOpLogo';
import { signOut } from 'next-auth/react';
import styles from './Sidebar.module.css';
import { useViewportLte } from '@/components/mobile/useViewportLte';
import { MobileNav } from '@/components/mobile/MobileNav';

interface SidebarProps {
  user: { id: string; name: string; email: string; companyName: string; role: string };
  // For the project hub (no project selected)
  projects?: Array<{ id: string; name: string; color: string; icon: string }>;
  // For project-scoped pages
  currentProject?: { id: string; name: string; color: string; description: string | null } | null;
  boards?: Array<{ id: string; name: string }>;
  memberCount?: number;
}

export default function Sidebar({ user, projects, currentProject, boards, memberCount }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  // M1 Phase 1 / Plan 01-04.4 — at <768px the sidebar collapses into a
  // vaul Drawer triggered by a fixed hamburger; layouts that pad-left by
  // var(--sidebar-current-width) get 0 so content fills the viewport.
  const isMobile = useViewportLte('md');

  // Reflect collapse state on <html> so layouts can shift content via CSS variable.
  // On mobile the drawer is overlay-only — no padding reservation.
  useEffect(() => {
    const root = document.documentElement;
    const token = isMobile ? '0px' : (collapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)');
    root.style.setProperty('--sidebar-current-width', token);
    return () => { root.style.removeProperty('--sidebar-current-width'); };
  }, [collapsed, isMobile]);
  const [showSwitcher, setShowSwitcher] = useState(false);
  const [switcherSearch, setSwitcherSearch] = useState('');
  const switcherRef = useRef<HTMLDivElement>(null);
  const [chatUnread, setChatUnread] = useState(0);
  const [notifUnread, setNotifUnread] = useState(0);

  const isActive = (href: string) => href === pathname || pathname.startsWith(href + '/');
  const getInitials = (name: string) => name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

  // Close switcher on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) {
        setShowSwitcher(false);
        setSwitcherSearch('');
      }
    };
    if (showSwitcher) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showSwitcher]);

  // Poll for notification unread count
  useEffect(() => {
    let active = true;
    const fetchCount = async () => {
      try {
        const res = await fetch('/api/notifications?countOnly=1', { cache: 'no-store' });
        if (!res.ok) return;
        const { unreadCount } = await res.json();
        if (active) setNotifUnread(unreadCount || 0);
      } catch {}
    };
    fetchCount();
    const interval = setInterval(fetchCount, 20000);
    const onFocus = () => fetchCount();
    window.addEventListener('focus', onFocus);
    return () => { active = false; clearInterval(interval); window.removeEventListener('focus', onFocus); };
  }, [pathname]);

  // Listen for unread chat updates from localStorage
  useEffect(() => {
    const checkUnread = () => {
      if (!currentProject) return;
      try {
        const val = localStorage.getItem(`chat-unread-${currentProject.id}`);
        setChatUnread(val ? parseInt(val, 10) : 0);
      } catch {}
    };
    checkUnread();
    const handleStorage = (e: StorageEvent) => {
      if (e.key?.startsWith('chat-unread-')) checkUnread();
    };
    window.addEventListener('storage', handleStorage);
    // Also poll every 3 seconds as fallback
    const interval = setInterval(checkUnread, 3000);
    return () => { window.removeEventListener('storage', handleStorage); clearInterval(interval); };
  }, [currentProject]);

  // If we're in a project context, show project-scoped nav
  const inProject = !!currentProject;
  const projectBase = currentProject ? `/p/${currentProject.id}` : '';

  const projectNav = currentProject ? [
    { href: `${projectBase}`, icon: LayoutDashboard, label: 'Overview', exact: true },
    { href: `${projectBase}/chat`, icon: MessageSquare, label: 'Chat' },
    { href: `${projectBase}/agents`, icon: Bot, label: 'AI Agents' },
    { href: `${projectBase}/members`, icon: Users, label: 'Members' },
    { href: `${projectBase}/settings`, icon: Settings, label: 'Settings' },
  ] : [];

  const isNavActive = (href: string, exact?: boolean) => {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(href + '/');
  };

  const filteredProjects = (projects || []).filter((p) =>
    !switcherSearch || p.name.toLowerCase().includes(switcherSearch.toLowerCase())
  );

  // The full sidebar JSX, used both as desktop <aside> and as mobile drawer
  // contents. Extracted into a const so the mobile/desktop branch below can
  // reuse it without duplicating 200+ lines.
  const sidebarBody = (
    <>
      {/* Header */}
      <div className={styles.header}>
        <Link href="/" className={styles.logo}>
          <div className={styles.logoIcon}><CoOpLogo size={20} /></div>
          {!collapsed && <span className={styles.logoText}>Co-Op</span>}
        </Link>
        <button className={styles.toggle} onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* Project Badge (when in project) */}
      {inProject && !collapsed && (
        <div className={styles.projectBadge}>
          <div className={styles.projectBadgeDot} style={{ background: currentProject.color }} />
          <div className={styles.projectBadgeInfo}>
            <span className={styles.projectBadgeName}>{currentProject.name}</span>
            <span className={styles.projectBadgeMeta}>{memberCount || 0} member{memberCount !== 1 ? 's' : ''}</span>
          </div>
        </div>
      )}
      {inProject && collapsed && (
        <div className={styles.projectBadge} title={currentProject!.name}>
          <div className={styles.projectBadgeDot} style={{ background: currentProject!.color, width: 24, height: 24, fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, borderRadius: 6 }}>
            {currentProject!.name.charAt(0).toUpperCase()}
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className={styles.nav}>
        <div className={styles.section}>
          {!collapsed && <span className={styles.sectionLabel}>Global</span>}
          {(() => {
            const notifHref = currentProject ? `/p/${currentProject.id}/notifications` : '/notifications';
            const active = isNavActive('/notifications') || pathname?.endsWith('/notifications');
            return (
              <Link href={notifHref}
                className={`${styles.item} ${active ? styles.itemActive : ''}`}
                title={collapsed ? 'Notifications' : undefined}>
                <Bell size={20} />
                {!collapsed && <span>Notifications</span>}
                {notifUnread > 0 && (
                  <span className={styles.unreadDot}>{!collapsed && notifUnread}</span>
                )}
                {active && <div className={styles.indicator} />}
              </Link>
            );
          })()}
        </div>
        {inProject ? (
          <>
            {/* Project navigation */}
            <div className={styles.section}>
              {!collapsed && <span className={styles.sectionLabel}>Project</span>}
              {projectNav.map((item) => (
                <Link key={item.href} href={item.href}
                  className={`${styles.item} ${isNavActive(item.href, item.exact) ? styles.itemActive : ''}`}
                  title={collapsed ? item.label : undefined}>
                  <item.icon size={20} />
                  {!collapsed && <span>{item.label}</span>}
                  {item.label === 'Chat' && chatUnread > 0 && (
                    <span className={styles.unreadDot}>{!collapsed && chatUnread}</span>
                  )}
                  {isNavActive(item.href, item.exact) && <div className={styles.indicator} />}
                </Link>
              ))}
            </div>

            {/* Boards section */}
            <div className={styles.section}>
              {!collapsed && (
                <div className={styles.sectionHeader}>
                  <span className={styles.sectionLabel}>Boards</span>
                </div>
              )}
              {(boards || []).map((board) => (
                <Link key={board.id} href={`${projectBase}/boards/${board.id}`}
                  className={`${styles.item} ${isNavActive(`${projectBase}/boards/${board.id}`) ? styles.itemActive : ''}`}
                  title={collapsed ? board.name : undefined}>
                  <Columns3 size={18} />
                  {!collapsed && <span className={styles.projectName}>{board.name}</span>}
                  {isNavActive(`${projectBase}/boards/${board.id}`) && <div className={styles.indicator} />}
                </Link>
              ))}
              {(boards || []).length === 0 && !collapsed && (
                <p className={styles.empty}>No boards yet</p>
              )}
            </div>
          </>
        ) : (
          /* Hub navigation */
          <div className={styles.section}>
            {!collapsed && <span className={styles.sectionLabel}>Menu</span>}
            <Link href="/" className={`${styles.item} ${pathname === '/' ? styles.itemActive : ''}`}
              title={collapsed ? 'Projects' : undefined}>
              <FolderKanban size={20} />
              {!collapsed && <span>Projects</span>}
              {pathname === '/' && <div className={styles.indicator} />}
            </Link>
          </div>
        )}
      </nav>

      {/* Footer: Project Switcher + User */}
      <div className={styles.footer}>
        {/* Project Switcher */}
        {!collapsed && (
          <div className={styles.switcherWrapper} ref={switcherRef}>
            <button
              className={styles.switcherButton}
              onClick={() => setShowSwitcher(!showSwitcher)}
            >
              {currentProject ? (
                <>
                  <div className={styles.switcherDot} style={{ background: currentProject.color }} />
                  <span className={styles.switcherName}>{currentProject.name}</span>
                </>
              ) : (
                <>
                  <div className={styles.switcherDot} style={{ background: 'var(--color-text-tertiary)' }} />
                  <span className={styles.switcherName}>Select project</span>
                </>
              )}
              <ChevronsUpDown size={14} style={{ color: 'var(--color-text-tertiary)', marginLeft: 'auto', flexShrink: 0 }} />
            </button>

            {showSwitcher && (
              <div className={styles.switcherDropdown}>
                <div className={styles.switcherSearchWrap}>
                  <Search size={14} className={styles.switcherSearchIcon} />
                  <input
                    className={styles.switcherSearchInput}
                    placeholder="Search projects..."
                    value={switcherSearch}
                    onChange={(e) => setSwitcherSearch(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className={styles.switcherList}>
                  {filteredProjects.map((p) => (
                    <button
                      key={p.id}
                      className={`${styles.switcherItem} ${currentProject?.id === p.id ? styles.switcherItemActive : ''}`}
                      onClick={() => {
                        router.push(`/p/${p.id}`);
                        setShowSwitcher(false);
                        setSwitcherSearch('');
                      }}
                    >
                      <div className={styles.switcherItemDot} style={{ background: p.color }} />
                      <span>{p.name}</span>
                      {currentProject?.id === p.id && <Check size={14} style={{ marginLeft: 'auto', color: 'var(--color-accent)' }} />}
                    </button>
                  ))}
                  {filteredProjects.length === 0 && (
                    <div className={styles.switcherEmpty}>No projects found</div>
                  )}
                </div>
                <div className={styles.switcherFooter}>
                  <Link href="/" className={styles.switcherCreate} onClick={() => setShowSwitcher(false)}>
                    <Plus size={14} />
                    <span>All Projects</span>
                  </Link>
                </div>
              </div>
            )}
          </div>
        )}

        {/* User */}
        <div className={styles.user}>
          <div className="avatar" style={{ background: 'var(--color-accent-muted)', color: 'var(--color-accent)' }}>{getInitials(user.name)}</div>
          {!collapsed && (
            <div className={styles.userInfo}>
              <span className={styles.userName}>{user.name}</span>
              <span className={styles.userRole}>{user.role}</span>
            </div>
          )}
          {!collapsed && (
            <button className={styles.logout} onClick={() => signOut()} title="Sign out">
              <LogOut size={16} />
            </button>
          )}
        </div>
      </div>
    </>
  );

  if (isMobile) {
    // Mobile: hamburger trigger (fixed top-left) + drawer containing the
    // full sidebar body. The desktop <aside> structure with collapse toggle
    // and fixed positioning doesn't apply here — the Drawer wrapper handles
    // overlay + dismiss + safe-area.
    return <MobileNav>{sidebarBody}</MobileNav>;
  }

  return (
    <aside className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''}`}>
      {sidebarBody}
    </aside>
  );
}
