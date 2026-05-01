'use client';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Users, Loader2, X, UserPlus, Shield, Crown, Trash2, Mail } from 'lucide-react';

interface MemberData {
  id: string;
  role: string;
  createdAt: string;
  user: { id: string; name: string; email: string; avatarUrl: string | null; role: string };
}

const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

const roleIcons: Record<string, typeof Crown> = { owner: Crown, admin: Shield, member: Users };
const roleColors: Record<string, string> = { owner: 'var(--color-warning)', admin: 'var(--color-info)', member: 'var(--color-text-tertiary)' };

export default function ProjectMembersPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { data: session } = useSession();
  const currentUser = session?.user as any;
  const isAdmin = currentUser?.role === 'admin';
  const [members, setMembers] = useState<MemberData[]>([]);
  const [savingRole, setSavingRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => { fetchMembers(); }, [projectId]);

  const fetchMembers = async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/members`);
      if (res.ok) setMembers(await res.json());
    } catch {} finally { setLoading(false); }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`/api/projects/${projectId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      const data = await res.json();
      if (res.ok) {
        setMembers(prev => [...prev, data]);
        setInviteEmail('');
        setSuccess(`${data.user.name} has been added to the project!`);
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(data.error || 'Failed to invite user');
      }
    } catch { setError('Something went wrong'); }
    finally { setInviting(false); }
  };

  const handleChangeCompanyRole = async (userId: string, role: string) => {
    setSavingRole(userId);
    try {
      const res = await fetch(`/api/team/${userId}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      if (res.ok) {
        const { user } = await res.json();
        setMembers(prev => prev.map(m => m.user.id === userId ? { ...m, user: { ...m.user, role: user.role } } : m));
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Failed to change role');
      }
    } catch { alert('Failed to change role'); }
    finally { setSavingRole(null); }
  };

  const handleRemove = async (userId: string, name: string) => {
    if (!confirm(`Remove ${name} from this project?`)) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/members`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (res.ok) setMembers(prev => prev.filter(m => m.user.id !== userId));
    } catch {}
  };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-16)' }}><Loader2 size={24} className="spin" style={{ color: 'var(--color-text-tertiary)' }} /></div>;

  return (
    <div style={{ padding: 'var(--space-8)', maxWidth: 800, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-6)' }}>
        <div>
          <h1 className="heading-2" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <Users size={24} style={{ color: 'var(--color-accent)' }} />
            Members
          </h1>
          <p className="text-secondary" style={{ marginTop: 'var(--space-1)' }}>{members.length} member{members.length !== 1 ? 's' : ''} in this project</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowInvite(!showInvite)}>
          <UserPlus size={16} />Invite Member
        </button>
      </div>

      {/* Invite Form */}
      {showInvite && (
        <div className="glass-panel" style={{ padding: 'var(--space-5)', marginBottom: 'var(--space-6)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
            <Mail size={16} style={{ color: 'var(--color-accent)' }} />
            <span style={{ fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-sm)' }}>Invite by email</span>
          </div>
          <form onSubmit={handleInvite} style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-end' }}>
            <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
              <input className="input" type="email" placeholder="colleague@company.com" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} required />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <select className="input" value={inviteRole} onChange={e => setInviteRole(e.target.value)} style={{ minWidth: 120 }}>
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <button type="submit" className="btn btn-primary" disabled={inviting || !inviteEmail.trim()} style={{ flexShrink: 0 }}>
              {inviting ? <Loader2 size={16} className="spin" /> : 'Invite'}
            </button>
            <button type="button" className="btn btn-ghost btn-icon" onClick={() => { setShowInvite(false); setError(''); setSuccess(''); }} style={{ flexShrink: 0 }}>
              <X size={16} />
            </button>
          </form>
          {error && <div style={{ marginTop: 'var(--space-3)', padding: 'var(--space-2) var(--space-3)', background: 'var(--color-error-muted)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-sm)', color: 'var(--color-error)' }}>{error}</div>}
          {success && <div style={{ marginTop: 'var(--space-3)', padding: 'var(--space-2) var(--space-3)', background: 'var(--color-success-muted, rgba(0,217,146,0.1))', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-sm)', color: 'var(--color-accent)' }}>{success}</div>}
        </div>
      )}

      {/* Members List */}
      <div className="glass-panel" style={{ overflow: 'hidden' }}>
        {members.map((m, i) => {
          const RoleIcon = roleIcons[m.role] || Users;
          return (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', padding: 'var(--space-4) var(--space-5)', borderBottom: i < members.length - 1 ? '1px solid var(--color-surface-border)' : 'none' }}>
              <div className="avatar" style={{ background: 'var(--color-accent-muted)', color: 'var(--color-accent)', flexShrink: 0 }}>
                {getInitials(m.user.name)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-sm)' }}>{m.user.name}</div>
                <div className="text-tertiary text-xs">{m.user.email}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <span className="badge" style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--color-bg-tertiary)', color: roleColors[m.role] }}>
                  <RoleIcon size={12} />
                  {m.role.charAt(0).toUpperCase() + m.role.slice(1)}
                </span>
                {isAdmin ? (
                  <select
                    className="input"
                    value={m.user.role || 'member'}
                    disabled={savingRole === m.user.id}
                    onChange={(e) => handleChangeCompanyRole(m.user.id, e.target.value)}
                    title="Company-wide role"
                    style={{ height: 28, fontSize: 'var(--font-size-xs)', padding: '0 var(--space-2)', minWidth: 110 }}
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                ) : (
                  <span className="badge" style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--color-bg-tertiary)', color: (m.user.role === 'admin' ? 'var(--color-info)' : 'var(--color-text-tertiary)') }}>
                    <Shield size={12} />
                    {(m.user.role || 'member').charAt(0).toUpperCase() + (m.user.role || 'member').slice(1)}
                  </span>
                )}
                {m.role !== 'owner' && (
                  <button className="btn btn-ghost btn-icon btn-sm" onClick={() => handleRemove(m.user.id, m.user.name)} title="Remove member">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
