'use client';
import { useSession } from 'next-auth/react';
import { FolderKanban, Bot, MessageSquare, ArrowRight, Sparkles, TrendingUp, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

export default function DashboardPage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const stats = [
    { label: 'Projects', value: '0', icon: FolderKanban, color: 'var(--color-accent)' },
    { label: 'AI Agents', value: '0', icon: Bot, color: 'var(--color-role-cto)' },
    { label: 'Active Tasks', value: '0', icon: CheckCircle2, color: 'var(--color-success)' },
    { label: 'Messages', value: '0', icon: MessageSquare, color: 'var(--color-role-cmo)' },
  ];
  const quickActions = [
    { title: 'Create a Project', description: 'Start a new project with a Kanban board', href: '/projects', icon: FolderKanban, gradient: 'linear-gradient(135deg, #6366f1, #8b5cf6)' },
    { title: 'Add an AI Agent', description: 'Hire a CTO, CMO, or custom AI role', href: '/agents', icon: Bot, gradient: 'linear-gradient(135deg, #8b5cf6, #a855f7)' },
    { title: 'Setup API Keys', description: 'Connect OpenAI or Anthropic', href: '/settings', icon: Sparkles, gradient: 'linear-gradient(135deg, #06b6d4, #3b82f6)' },
  ];

  return (
    <div style={{ padding: 'var(--space-8)', maxWidth: 1200 }}>
      <div className="glass-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-8)', marginBottom: 'var(--space-6)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'relative', zIndex: 1 }}>
          <h1 className="heading-2">Welcome back, <span className="text-gradient">{user?.name || 'there'}</span></h1>
          <p className="text-secondary" style={{ marginTop: 'var(--space-2)' }}>Here&apos;s what&apos;s happening in your workspace</p>
        </div>
        <TrendingUp size={80} strokeWidth={1} style={{ color: 'var(--color-accent-muted)', opacity: 0.3 }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)', marginBottom: 'var(--space-8)' }}>
        {stats.map((s) => (
          <div key={s.label} className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', padding: 'var(--space-5)' }}>
            <div style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-lg)', color: s.color }}><s.icon size={22} /></div>
            <div><div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 'var(--font-weight-bold)', lineHeight: 1 }}>{s.value}</div><div className="text-tertiary text-sm" style={{ marginTop: 'var(--space-1)' }}>{s.label}</div></div>
          </div>
        ))}
      </div>

      <h2 className="heading-4" style={{ marginBottom: 'var(--space-4)' }}>Get started</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 'var(--space-4)', marginBottom: 'var(--space-8)' }}>
        {quickActions.map((a) => (
          <Link key={a.title} href={a.href} className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', padding: 'var(--space-5)', textDecoration: 'none' }}>
            <div style={{ width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-lg)', color: 'white', background: a.gradient, flexShrink: 0 }}><a.icon size={24} /></div>
            <div style={{ flex: 1 }}><div style={{ fontWeight: 'var(--font-weight-semibold)' }}>{a.title}</div><div className="text-tertiary text-sm" style={{ marginTop: 'var(--space-1)' }}>{a.description}</div></div>
            <ArrowRight size={16} style={{ color: 'var(--color-text-tertiary)' }} />
          </Link>
        ))}
      </div>

      <h2 className="heading-4" style={{ marginBottom: 'var(--space-4)' }}>Recent Activity</h2>
      <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-10)', textAlign: 'center' }}>
        <Sparkles size={32} style={{ opacity: 0.4 }} />
        <p className="text-secondary">No activity yet. Create a project to get started!</p>
      </div>
    </div>
  );
}
