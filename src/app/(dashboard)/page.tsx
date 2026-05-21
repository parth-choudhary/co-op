'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, FolderKanban, Loader2, X, ArrowRight, Users, Columns3, Bot, Sparkles, Terminal, Wand2, BookOpen } from 'lucide-react';

interface ProjectData {
  id: string; name: string; description: string | null; color: string; role: string;
  boards: Array<{ columns: Array<{ _count: { cards: number } }> }>;
  _count: { members: number; agents: number; channels: number };
  createdAt: string;
}

const colors = ['#00d992', '#2fd6a1', '#818cf8', '#ec4899', '#4cb3d4', '#ffba00', '#fb565b', '#f97316'];

export default function ProjectHubPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [seedingDemo, setSeedingDemo] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', color: '#00d992', defaultAgentShell: false });

  // Brownfield onboarding entry point. Seeds (or finds the existing) demo
  // project for this user, then deep-links them straight to it. Idempotent
  // by user+company on the server, so double-clicks are safe.
  const handleCreateDemo = async () => {
    setSeedingDemo(true);
    try {
      const res = await fetch('/api/onboarding/demo', { method: 'POST' });
      if (res.ok) {
        const { projectId } = await res.json();
        if (projectId) router.push(`/p/${projectId}`);
      }
    } finally { setSeedingDemo(false); }
  };

  useEffect(() => {
    fetch('/api/projects').then((r) => r.json()).then(setProjects).finally(() => setLoading(false));
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      if (res.ok) {
        const proj = await res.json();
        setShowModal(false);
        setForm({ name: '', description: '', color: '#00d992', defaultAgentShell: false });
        router.push(`/p/${proj.id}`);
      }
    } finally { setCreating(false); }
  };

  const totalCards = (p: ProjectData) => p.boards?.reduce((t, b) => t + b.columns?.reduce((s, c) => s + (c._count?.cards ?? 0), 0), 0) ?? 0;

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 'var(--space-16)', minHeight: '60vh' }}><Loader2 size={24} className="spin" style={{ color: 'var(--color-text-tertiary)' }} /></div>;

  return (
    <div style={{ padding: 'var(--space-8)', maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-8)' }}>
        <div>
          <h1 className="heading-2" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <Sparkles size={24} style={{ color: 'var(--color-accent)' }} />
            Your Projects
          </h1>
          <p className="text-secondary" style={{ marginTop: 'var(--space-1)' }}>
            {projects.length} project{projects.length !== 1 ? 's' : ''} — select one to get started
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <Link href="/onboarding" className="btn btn-ghost" title="Getting-started guide">
            <BookOpen size={16} /> Help
          </Link>
          <button className="btn btn-secondary" onClick={handleCreateDemo} disabled={seedingDemo} title="Spin up a guided demo project">
            {seedingDemo ? <Loader2 size={16} className="spin" /> : <Wand2 size={16} />} Try the demo
          </button>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            <Plus size={16} />New Project
          </button>
        </div>
      </div>

      {/* Projects Grid */}
      {projects.length === 0 ? (
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 'var(--space-16)', gap: 'var(--space-4)', textAlign: 'center' }}>
          <div style={{ width: 80, height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-tertiary)', border: '2px solid var(--color-surface-border)', borderRadius: 'var(--radius-lg)' }}>
            <FolderKanban size={36} style={{ color: 'var(--color-accent)', opacity: 0.5 }} />
          </div>
          <p style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-semibold)' }}>No projects yet</p>
          <p className="text-secondary" style={{ maxWidth: 480 }}>Spin up a guided demo to see how kanban, chat, and AI agents play together — or jump straight to a real project.</p>
          <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
            <button className="btn btn-primary" onClick={handleCreateDemo} disabled={seedingDemo}>
              {seedingDemo ? <Loader2 size={16} className="spin" /> : <Wand2 size={16} />} Try the guided demo
            </button>
            <button className="btn btn-secondary" onClick={() => setShowModal(true)}>
              <Plus size={16} />New Project
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 'var(--space-4)' }}>
          {projects.map((p) => (
            <Link key={p.id} href={`/p/${p.id}`} className="glass-card" style={{ display: 'flex', flexDirection: 'column', padding: 0, textDecoration: 'none', overflow: 'hidden', transition: 'all var(--transition-fast)' }}>
              {/* Color bar */}
              <div style={{ height: 4, background: p.color }} />
              <div style={{ padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                  <div style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-lg)', background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-surface-border)', color: p.color, fontWeight: 700, fontSize: 'var(--font-size-lg)' }}>
                    {p.name.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-base)' }}>{p.name}</div>
                    {p.description && <div className="text-tertiary text-xs" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.description}</div>}
                  </div>
                  <ArrowRight size={16} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
                </div>
                <div className="divider" />
                <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                  <span className="text-xs" style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--color-text-tertiary)' }}>
                    <Columns3 size={12} /> {totalCards(p)} cards
                  </span>
                  <span className="text-xs" style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--color-text-tertiary)' }}>
                    <Users size={12} /> {p._count?.members || 1} member{(p._count?.members || 1) !== 1 ? 's' : ''}
                  </span>
                  <span className="text-xs" style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--color-text-tertiary)' }}>
                    <Bot size={12} /> {p._count?.agents || 0} agent{(p._count?.agents || 0) !== 1 ? 's' : ''}
                  </span>
                  <span className="badge badge-accent" style={{ marginLeft: 'auto', fontSize: 'var(--font-size-xs)' }}>{p.role}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-6) var(--space-6) var(--space-4)' }}>
              <h2 className="heading-3">New Project</h2>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowModal(false)}><X size={16} /></button>
            </div>
            <form onSubmit={handleCreate} style={{ padding: '0 var(--space-6) var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
              <div className="form-group">
                <label className="form-label">Name</label>
                <input className="input" placeholder="My Project" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoFocus />
              </div>
              <div className="form-group">
                <label className="form-label">Description (optional)</label>
                <textarea className="input textarea" placeholder="What's this project about?" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Color</label>
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                  {colors.map((c) => (
                    <button key={c} type="button" onClick={() => setForm({ ...form, color: c })}
                      style={{ width: 32, height: 32, borderRadius: 'var(--radius-full)', background: c, border: form.color === c ? '2px solid #f2f2f2' : '2px solid transparent', cursor: 'pointer', transition: 'all var(--transition-fast)' }} />
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label className="glass-panel" style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)', padding: 'var(--space-3) var(--space-4)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.defaultAgentShell} onChange={(e) => setForm({ ...form, defaultAgentShell: e.target.checked })} style={{ marginTop: 4 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontWeight: 'var(--font-weight-medium)' }}>
                      <Terminal size={14} style={{ color: 'var(--color-accent)' }} />
                      Allow agents to run shell commands
                    </div>
                    <div className="text-xs text-tertiary" style={{ marginTop: 4 }}>
                      Lets Claude/OpenAI agents in this project execute terminal commands inside the project sandbox — like Claude Code or Codex CLI. Applies to new agents by default; you can override per agent later in the agent harness.
                    </div>
                  </div>
                </label>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={creating || !form.name.trim()}>
                  {creating ? <Loader2 size={16} className="spin" /> : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
