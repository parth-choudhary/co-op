'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Gamepad2, LayoutDashboard, FolderKanban, MessageSquare, Bot, Settings, ChevronLeft, ChevronRight, Plus, LogOut } from 'lucide-react';
import { signOut } from 'next-auth/react';
import styles from './Sidebar.module.css';

interface SidebarProps {
  user: { name: string; email: string; companyName: string; role: string };
  projects: Array<{ id: string; name: string; color: string; icon: string }>;
}

const mainNav = [
  { href: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/projects', icon: FolderKanban, label: 'Projects' },
  { href: '/chat', icon: MessageSquare, label: 'Chat' },
  { href: '/agents', icon: Bot, label: 'AI Agents' },
  { href: '/settings', icon: Settings, label: 'Settings' },
];

export default function Sidebar({ user, projects }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const isActive = (href: string) => href === '/' ? pathname === '/' : pathname.startsWith(href);
  const getInitials = (name: string) => name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

  return (
    <aside className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''}`}>
      <div className={styles.header}>
        <Link href="/" className={styles.logo}>
          <div className={styles.logoIcon}><Gamepad2 size={20} /></div>
          {!collapsed && <span className={styles.logoText}>Co-Op</span>}
        </Link>
        <button className={styles.toggle} onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {!collapsed && (
        <div className={styles.company}>
          <div className={styles.companyBadge}>{user.companyName.charAt(0).toUpperCase()}</div>
          <div className={styles.companyInfo}>
            <span className={styles.companyName}>{user.companyName}</span>
            <span className={styles.companyPlan}>Free plan</span>
          </div>
        </div>
      )}

      <nav className={styles.nav}>
        <div className={styles.section}>
          {!collapsed && <span className={styles.sectionLabel}>Menu</span>}
          {mainNav.map((item) => (
            <Link key={item.href} href={item.href}
              className={`${styles.item} ${isActive(item.href) ? styles.itemActive : ''}`}
              title={collapsed ? item.label : undefined}>
              <item.icon size={20} />
              {!collapsed && <span>{item.label}</span>}
              {isActive(item.href) && <div className={styles.indicator} />}
            </Link>
          ))}
        </div>
        <div className={styles.section}>
          {!collapsed && (
            <div className={styles.sectionHeader}>
              <span className={styles.sectionLabel}>Projects</span>
              <Link href="/projects" className={styles.sectionAction}><Plus size={14} /></Link>
            </div>
          )}
          {projects.map((project) => (
            <Link key={project.id} href={`/projects/${project.id}`}
              className={`${styles.item} ${pathname.startsWith(`/projects/${project.id}`) ? styles.itemActive : ''}`}>
              <div className={styles.projectDot} style={{ background: project.color }} />
              {!collapsed && <span className={styles.projectName}>{project.name}</span>}
            </Link>
          ))}
          {projects.length === 0 && !collapsed && <p className={styles.empty}>No projects yet</p>}
        </div>
      </nav>

      <div className={styles.footer}>
        <div className={styles.user}>
          <div className="avatar" style={{ background: 'var(--color-accent-gradient)' }}>{getInitials(user.name)}</div>
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
    </aside>
  );
}
