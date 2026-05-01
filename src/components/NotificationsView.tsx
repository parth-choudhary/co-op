'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Bell, CheckCheck, Loader2, AtSign, UserPlus, MessageSquare, CornerDownRight } from 'lucide-react';

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  summary: string;
  link: string;
  projectId: string | null;
  boardId: string | null;
  cardId: string | null;
  read: boolean;
  actorName: string | null;
  createdAt: string;
}

const typeIcons: Record<string, typeof Bell> = {
  card_mention: AtSign,
  comment_mention: AtSign,
  card_assigned: UserPlus,
  card_member_added: UserPlus,
  comment_reply: CornerDownRight,
};

function timeAgo(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diff = Math.max(0, now - d.getTime());
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

export default function NotificationsView() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [marking, setMarking] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/notifications${filter === 'unread' ? '?unread=1' : ''}`, { cache: 'no-store' });
      if (res.ok) {
        const { notifications } = await res.json();
        setNotifications(notifications);
      }
    } finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const markRead = async (ids: string[]) => {
    if (ids.length === 0) return;
    setNotifications((prev) => prev.map((n) => (ids.includes(n.id) ? { ...n, read: true } : n)));
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
    } catch {}
  };

  const markAllRead = async () => {
    setMarking(true);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      });
    } catch {}
    setMarking(false);
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div style={{ padding: 'var(--space-8)', maxWidth: 860, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-6)' }}>
        <div>
          <h1 className="heading-2" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <Bell size={24} style={{ color: 'var(--color-accent)' }} />
            Notifications
          </h1>
          <p className="text-secondary" style={{ marginTop: 'var(--space-1)' }}>
            {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <div style={{ display: 'inline-flex', background: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-md)', padding: 2 }}>
            <button
              className={`btn btn-sm ${filter === 'all' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setFilter('all')}
              style={{ height: 28 }}
            >All</button>
            <button
              className={`btn btn-sm ${filter === 'unread' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setFilter('unread')}
              style={{ height: 28 }}
            >Unread</button>
          </div>
          <button
            className={`btn btn-sm ${unreadCount === 0 ? 'btn-ghost' : 'btn-primary'}`}
            onClick={markAllRead}
            disabled={marking || unreadCount === 0}
            title={unreadCount === 0 ? 'Nothing to mark' : `Mark ${unreadCount} as read`}
            style={{ height: 32, gap: 'var(--space-2)' }}
          >
            {marking ? <Loader2 size={14} className="spin" /> : <CheckCheck size={14} />}
            Mark all as read
            {unreadCount > 0 && (
              <span className="badge" style={{ background: 'rgba(0,0,0,0.2)', color: 'inherit', padding: '1px 6px', fontSize: 'var(--font-size-xs)' }}>
                {unreadCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-16)' }}>
          <Loader2 size={24} className="spin" style={{ color: 'var(--color-text-tertiary)' }} />
        </div>
      ) : notifications.length === 0 ? (
        <div className="glass-panel" style={{ padding: 'var(--space-12)', textAlign: 'center' }}>
          <Bell size={32} style={{ color: 'var(--color-text-tertiary)', opacity: 0.4, margin: '0 auto var(--space-3)' }} />
          <div className="text-tertiary">No notifications{filter === 'unread' ? ' unread' : ''}.</div>
        </div>
      ) : (
        <div className="glass-panel" style={{ overflow: 'hidden' }}>
          {notifications.map((n, i) => {
            const Icon = typeIcons[n.type] || MessageSquare;
            return (
              <Link
                key={n.id}
                href={n.link}
                onClick={() => { if (!n.read) markRead([n.id]); }}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 'var(--space-4)',
                  padding: 'var(--space-4) var(--space-5)',
                  borderBottom: i < notifications.length - 1 ? '1px solid var(--color-surface-border)' : 'none',
                  background: n.read ? 'transparent' : 'var(--color-accent-muted)',
                  textDecoration: 'none', color: 'inherit',
                }}
              >
                <div style={{
                  width: 32, height: 32, borderRadius: 'var(--radius-md)', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'var(--color-bg-tertiary)', color: n.read ? 'var(--color-text-tertiary)' : 'var(--color-accent)',
                }}>
                  <Icon size={16} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: n.read ? 'var(--font-weight-medium)' : 'var(--font-weight-semibold)', fontSize: 'var(--font-size-sm)' }}>
                    {n.title}
                  </div>
                  <div className="text-secondary text-xs" style={{ marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {n.summary}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexShrink: 0 }}>
                  <span className="text-tertiary text-xs">{timeAgo(n.createdAt)}</span>
                  {!n.read && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-accent)' }} />}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
