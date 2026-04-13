'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Plus, FolderKanban, Loader2, X, ArrowRight } from 'lucide-react';

interface ProjectData { id: string; name: string; description: string | null; color: string; boards: Array<{ columns: Array<{ _count: { cards: number } }> }>; createdAt: string; }

const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#06b6d4', '#22c55e', '#f59e0b', '#ef4444', '#f97316'];

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', color: '#6366f1' });

  useEffect(() => { fetch('/api/projects').then((r) => r.json()).then(setProjects).finally(() => setLoading(false)); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      if (res.ok) {
        const proj = await res.json();
        setProjects((prev) => [proj, ...prev]);
        setShowModal(false);
        setForm({ name: '', description: '', color: '#6366f1' });
      }
    } finally { setCreating(false); }
  };

  const totalCards = (p: ProjectData) => p.boards?.reduce((t, b) => t + b.columns?.reduce((s, c) => s + (c._count?.cards ?? 0), 0), 0) ?? 0;

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-16)' }}><Loader2 size={24} className="spin" style={{ color: 'var(--color-text-tertiary)' }} /></div>;

  return (
    <div style={{ padding: 'var(--space-8)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-6)' }}>
        <div>
          <h1 className="heading-2">Projects</h1>
          <p className="text-secondary" style={{ marginTop: 'var(--space-1)' }}>{projects.length} project{projects.length !== 1 ? 's' : ''}</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}><Plus size={16} />New Project</button>
      </div>

      {projects.length === 0 ? (
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 'var(--space-16)', gap: 'var(--space-3)', textAlign: 'center' }}>
          <FolderKanban size={48} style={{ opacity: 0.3 }} />
          <p style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-medium)' }}>No projects yet</p>
          <p className="text-secondary">Create your first project to start managing tasks</p>
          <button className="btn btn-primary" style={{ marginTop: 'var(--space-4)' }} onClick={() => setShowModal(true)}><Plus size={16} />Create Project</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 'var(--space-4)' }}>
          {projects.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`} className="glass-card" style={{ display: 'flex', flexDirection: 'column', padding: 'var(--space-5)', textDecoration: 'none', gap: 'var(--space-3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <div style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-lg)', background: `${p.color}20`, color: p.color }}><FolderKanban size={20} /></div>
                <div style={{ flex: 1 }}><div style={{ fontWeight: 'var(--font-weight-semibold)' }}>{p.name}</div>{p.description && <div className="text-tertiary text-sm" style={{ marginTop: 'var(--space-1)' }}>{p.description}</div>}</div>
                <ArrowRight size={16} style={{ color: 'var(--color-text-tertiary)' }} />
              </div>
              <div className="divider" />
              <div style={{ display: 'flex', gap: 'var(--space-4)' }}>
                <span className="badge badge-accent">{totalCards(p)} cards</span>
                <span className="badge" style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-tertiary)' }}>{p.boards?.[0]?.columns?.length ?? 0} columns</span>
              </div>
            </Link>
          ))}
        </div>
      )}

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
                      style={{ width: 32, height: 32, borderRadius: 'var(--radius-full)', background: c, border: form.color === c ? '2px solid white' : '2px solid transparent', cursor: 'pointer', transition: 'all var(--transition-fast)' }} />
                  ))}
                </div>
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
