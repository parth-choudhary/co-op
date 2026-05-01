'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Columns3, MessageSquare, Bot, Users, Plus, Loader2, ArrowRight, Sparkles, TrendingUp, X, Info, Edit3, Check } from 'lucide-react';

interface BoardData { id: string; name: string; columns: Array<{ _count: { cards: number } }> }
interface AboutProposal { id: string; proposedText: string; reason: string | null; status: string; createdAt: string; agent?: { id: string; name: string; avatarUrl: string | null } | null }

export default function ProjectOverviewPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const [boards, setBoards] = useState<BoardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewBoard, setShowNewBoard] = useState(false);
  const [newBoardName, setNewBoardName] = useState('');
  const [creating, setCreating] = useState(false);

  // About section state
  const [about, setAbout] = useState<string>('');
  const [aboutEditing, setAboutEditing] = useState(false);
  const [aboutDraft, setAboutDraft] = useState('');
  const [aboutSaving, setAboutSaving] = useState(false);
  const [proposals, setProposals] = useState<AboutProposal[]>([]);
  const [reviewing, setReviewing] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/boards`).then(r => r.json()).then(setBoards).finally(() => setLoading(false));
    fetch(`/api/projects/${projectId}`).then(r => r.ok ? r.json() : null).then((p: any) => {
      if (p) { setAbout(p.about || ''); setAboutDraft(p.about || ''); }
    });
    fetch(`/api/projects/${projectId}/about-proposals?status=pending`).then(r => r.ok ? r.json() : { proposals: [] }).then((d: any) => setProposals(d.proposals || []));
  }, [projectId]);

  const saveAbout = async () => {
    setAboutSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ about: aboutDraft }) });
      if (res.ok) { setAbout(aboutDraft); setAboutEditing(false); }
    } finally { setAboutSaving(false); }
  };

  const reviewProposal = async (propId: string, action: 'approve' | 'reject') => {
    setReviewing(propId);
    try {
      const res = await fetch(`/api/projects/${projectId}/about-proposals/${propId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
      if (res.ok) {
        setProposals(prev => prev.filter(p => p.id !== propId));
        if (action === 'approve') {
          const approved = proposals.find(p => p.id === propId);
          if (approved) { setAbout(approved.proposedText); setAboutDraft(approved.proposedText); }
        }
      }
    } finally { setReviewing(null); }
  };

  const handleCreateBoard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBoardName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/boards`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newBoardName }) });
      if (res.ok) {
        const board = await res.json();
        setBoards(prev => [...prev, board]);
        setNewBoardName('');
        setShowNewBoard(false);
        router.refresh(); // refresh sidebar
      }
    } finally { setCreating(false); }
  };

  const totalCards = (b: BoardData) => b.columns?.reduce((t, c) => t + (c._count?.cards ?? 0), 0) ?? 0;

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-16)' }}><Loader2 size={24} className="spin" style={{ color: 'var(--color-text-tertiary)' }} /></div>;

  return (
    <div style={{ padding: 'var(--space-8)', maxWidth: 1000, margin: '0 auto' }}>
      {/* Header */}
      <div className="glass-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-8)', marginBottom: 'var(--space-6)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'relative', zIndex: 1 }}>
          <h1 className="heading-2">Project Overview</h1>
          <p className="text-secondary" style={{ marginTop: 'var(--space-2)' }}>Manage your boards, team, and resources</p>
        </div>
        <TrendingUp size={80} strokeWidth={1} style={{ color: 'var(--color-accent)', opacity: 0.15 }} />
      </div>

      {/* About */}
      <div className="glass-card" style={{ padding: 'var(--space-6)', marginBottom: 'var(--space-6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <Info size={18} style={{ color: 'var(--color-accent)' }} />
            <h2 className="heading-4">About this project</h2>
          </div>
          {!aboutEditing && (
            <button className="btn btn-ghost btn-sm" onClick={() => { setAboutDraft(about); setAboutEditing(true); }}>
              <Edit3 size={14} style={{ marginRight: 4 }} /> Edit
            </button>
          )}
        </div>
        <p className="text-tertiary text-xs" style={{ marginBottom: 'var(--space-3)' }}>
          Shared North Star — every agent reads this when responding. Agents may propose edits as you work; you approve them below.
        </p>
        {aboutEditing ? (
          <>
            <textarea
              className="input"
              value={aboutDraft}
              onChange={(e) => setAboutDraft(e.target.value)}
              placeholder="Describe what this project is, who it's for, the goal, current priorities, anything agents should know…"
              style={{ width: '100%', minHeight: 140, fontFamily: 'inherit', fontSize: 'var(--font-size-sm)', resize: 'vertical' }}
            />
            <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
              <button className="btn btn-primary btn-sm" onClick={saveAbout} disabled={aboutSaving}>
                {aboutSaving ? <Loader2 size={14} className="spin" /> : 'Save'}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => { setAboutEditing(false); setAboutDraft(about); }} disabled={aboutSaving}>Cancel</button>
            </div>
          </>
        ) : (
          <div style={{ whiteSpace: 'pre-wrap', color: about ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)', fontSize: 'var(--font-size-sm)', lineHeight: 1.6 }}>
            {about || 'No About section yet. Add one so agents know the project’s goals and context.'}
          </div>
        )}

        {proposals.length > 0 && (
          <div style={{ marginTop: 'var(--space-5)', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--color-surface-border)' }}>
            <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', marginBottom: 'var(--space-2)', color: 'var(--color-warning)' }}>
              {proposals.length} pending proposal{proposals.length === 1 ? '' : 's'} from agents
            </div>
            {proposals.map(p => (
              <div key={p.id} style={{ padding: 'var(--space-3)', border: '1px solid var(--color-surface-border)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-3)', background: 'var(--color-bg-tertiary)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
                  <div className="avatar avatar-sm" style={{ background: 'var(--color-role-cto)', color: 'white', fontSize: 9 }}>AI</div>
                  <span style={{ fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-sm)' }}>{p.agent?.name || 'Agent'}</span>
                  <span className="text-tertiary text-xs" style={{ marginLeft: 'auto' }}>{new Date(p.createdAt).toLocaleString()}</span>
                </div>
                {p.reason && <div className="text-secondary text-xs" style={{ marginBottom: 'var(--space-2)', fontStyle: 'italic' }}>“{p.reason}”</div>}
                <div style={{ whiteSpace: 'pre-wrap', fontSize: 'var(--font-size-xs)', padding: 'var(--space-2)', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-sm)', maxHeight: 200, overflow: 'auto', marginBottom: 'var(--space-2)' }}>
                  {p.proposedText}
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                  <button className="btn btn-primary btn-sm" onClick={() => reviewProposal(p.id, 'approve')} disabled={reviewing === p.id}>
                    {reviewing === p.id ? <Loader2 size={12} className="spin" /> : <><Check size={12} style={{ marginRight: 4 }} /> Approve</>}
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => reviewProposal(p.id, 'reject')} disabled={reviewing === p.id}>Reject</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)', marginBottom: 'var(--space-8)' }}>
        {[
          { href: `/p/${projectId}/chat`, icon: MessageSquare, label: 'Chat', desc: 'Team communication', color: 'var(--color-role-cmo)' },
          { href: `/p/${projectId}/agents`, icon: Bot, label: 'AI Agents', desc: 'Manage agents', color: 'var(--color-role-cto)' },
          { href: `/p/${projectId}/members`, icon: Users, label: 'Members', desc: 'Team management', color: 'var(--color-info)' },
          { href: `/p/${projectId}/settings`, icon: Sparkles, label: 'Settings', desc: 'API keys & config', color: 'var(--color-success-light)' },
        ].map(a => (
          <Link key={a.href} href={a.href} className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-4)', textDecoration: 'none' }}>
            <div style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-lg)', background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-surface-border)', color: a.color }}><a.icon size={20} /></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-sm)' }}>{a.label}</div>
              <div className="text-tertiary text-xs">{a.desc}</div>
            </div>
            <ArrowRight size={14} style={{ color: 'var(--color-text-tertiary)' }} />
          </Link>
        ))}
      </div>

      {/* Boards */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-4)' }}>
        <h2 className="heading-4">Kanban Boards</h2>
        <button className="btn btn-primary btn-sm" onClick={() => setShowNewBoard(true)}><Plus size={14} />New Board</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 'var(--space-4)' }}>
        {boards.map(b => (
          <Link key={b.id} href={`/p/${projectId}/boards/${b.id}`} className="glass-card" style={{ display: 'flex', flexDirection: 'column', padding: 'var(--space-5)', textDecoration: 'none', gap: 'var(--space-3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <div style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-surface-border)', color: 'var(--color-accent)' }}>
                <Columns3 size={18} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 'var(--font-weight-semibold)' }}>{b.name}</div>
                <div className="text-tertiary text-xs">{b.columns?.length || 0} columns · {totalCards(b)} cards</div>
              </div>
              <ArrowRight size={14} style={{ color: 'var(--color-text-tertiary)' }} />
            </div>
          </Link>
        ))}
        {boards.length === 0 && (
          <div className="glass-panel" style={{ padding: 'var(--space-8)', textAlign: 'center', gridColumn: '1 / -1' }}>
            <Columns3 size={32} style={{ color: 'var(--color-text-tertiary)', opacity: 0.3, margin: '0 auto var(--space-2)' }} />
            <p className="text-secondary">No boards yet. Create one to get started!</p>
          </div>
        )}
      </div>

      {/* New Board Modal */}
      {showNewBoard && (
        <div className="modal-overlay" onClick={() => setShowNewBoard(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-6) var(--space-6) var(--space-4)' }}>
              <h2 className="heading-3">New Board</h2>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowNewBoard(false)}><X size={16} /></button>
            </div>
            <form onSubmit={handleCreateBoard} style={{ padding: '0 var(--space-6) var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
              <div className="form-group">
                <label className="form-label">Board Name</label>
                <input className="input" placeholder="e.g., Marketing, Development..." value={newBoardName} onChange={e => setNewBoardName(e.target.value)} required autoFocus />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowNewBoard(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={creating || !newBoardName.trim()}>
                  {creating ? <Loader2 size={16} className="spin" /> : 'Create Board'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
