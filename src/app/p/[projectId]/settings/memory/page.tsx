'use client';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, BrainCircuit, Plus, Trash2, Loader2, Pencil, X, User, Bot } from 'lucide-react';
import { useToast } from '@/components/Toast';

interface ProjectMemoryRow {
  id: string;
  projectId: string;
  key: string;
  content: string;
  kind: 'decision' | 'glossary' | 'convention' | 'fact';
  source: 'agent' | 'admin' | 'manual';
  sourceRef: string | null;
  writtenBy: string | null; // agentId — null when human-authored
  createdAt: string;
  updatedAt: string;
}

interface Agent {
  id: string;
  name: string;
  roleLabel: string | null;
}

const KIND_OPTIONS: ProjectMemoryRow['kind'][] = ['decision', 'glossary', 'convention', 'fact'];

function kindBadgeStyle(kind: ProjectMemoryRow['kind']) {
  switch (kind) {
    case 'decision':
      return { background: 'rgba(0, 217, 146, 0.15)', color: 'var(--color-accent)' };
    case 'convention':
      return { background: 'rgba(99, 102, 241, 0.15)', color: '#a5b4fc' };
    case 'glossary':
      return { background: 'rgba(245, 158, 11, 0.12)', color: '#fbbf24' };
    default:
      return { background: 'rgba(148, 163, 184, 0.12)', color: 'var(--color-text-secondary)' };
  }
}

function relativeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function ProjectMemoryPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const toast = useToast();

  const [rows, setRows] = useState<ProjectMemoryRow[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<{ key: string; content: string; kind: ProjectMemoryRow['kind'] }>(
    { key: '', content: '', kind: 'fact' },
  );
  const [saving, setSaving] = useState(false);

  const agentNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of agents) map.set(a.id, a.name);
    return map;
  }, [agents]);

  async function load() {
    setLoading(true);
    try {
      const [memRes, agentRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/memory`),
        fetch(`/api/agents?projectId=${projectId}`),
      ]);
      if (memRes.ok) setRows(await memRes.json());
      if (agentRes.ok) setAgents(await agentRes.json());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  function openAdd() {
    setForm({ key: '', content: '', kind: 'fact' });
    setEditingKey(null);
    setShowAdd(true);
  }

  function openEdit(row: ProjectMemoryRow) {
    setForm({ key: row.key, content: row.content, kind: row.kind });
    setEditingKey(row.key);
    setShowAdd(true);
  }

  async function save() {
    const key = form.key.trim();
    const content = form.content.trim();
    if (!key || !content) {
      toast.error('Key and content are required');
      return;
    }
    setSaving(true);
    try {
      // POST is upsert on (projectId, key). We use POST for both create and edit
      // since the server upserts; PUT would also work but adds a second code path.
      const r = await fetch(`/api/projects/${projectId}/memory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, content, kind: form.kind, source: 'admin' }),
      });
      if (!r.ok) {
        const msg = (await r.json()).error || 'Save failed';
        toast.error(msg);
        return;
      }
      toast.success(editingKey ? `Updated "${key}"` : `Saved "${key}"`);
      setShowAdd(false);
      load();
    } finally {
      setSaving(false);
    }
  }

  async function remove(key: string) {
    if (!confirm(`Delete project memory "${key}"?`)) return;
    const r = await fetch(`/api/projects/${projectId}/memory/${encodeURIComponent(key)}`, { method: 'DELETE' });
    if (r.ok) {
      toast.success(`Deleted "${key}"`);
      load();
    } else {
      toast.error(`Delete failed (${r.status})`);
    }
  }

  // Group rows by kind to mirror how the harness renders them; gives the
  // settings view the same mental model the agent reads at runtime.
  const groupedRows = useMemo(() => {
    const groups: Record<string, ProjectMemoryRow[]> = {};
    for (const row of rows) {
      (groups[row.kind] ||= []).push(row);
    }
    for (const k of Object.keys(groups)) {
      groups[k].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    }
    return groups;
  }, [rows]);

  return (
    <div style={{ padding: 'var(--space-8)', maxWidth: 800, margin: '0 auto' }}>
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <Link
          href={`/p/${projectId}/settings`}
          className="text-sm text-tertiary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)' }}
        >
          <ArrowLeft size={14} /> Back to settings
        </Link>
      </div>

      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h1 className="heading-2" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <BrainCircuit size={24} style={{ color: 'var(--color-accent)' }} />
          Project memory
        </h1>
        <p className="text-secondary" style={{ marginTop: 'var(--space-1)' }}>
          Shared with every agent in this project — decisions, glossary, conventions, and facts the team should remember together.
          Agents write here via <code>set_project_memory</code>; humans use this page. Free-form team doctrine still lives in
          <code> About</code> / <code>USER.md</code> / <code>AGENTS.md</code> — this is the structured, searchable layer agents read on every run.
        </p>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--space-4)' }}>
        <button className="btn btn-primary btn-sm" onClick={openAdd}>
          <Plus size={14} /> Add memory
        </button>
      </div>

      <section className="glass-panel" style={{ padding: 'var(--space-6)' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-4)' }}>
            <Loader2 size={18} className="spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-tertiary" style={{ textAlign: 'center', padding: 'var(--space-6)' }}>
            No project memory yet. Add a decision, glossary entry, or convention to give every agent shared context.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
            {KIND_OPTIONS.filter((k) => groupedRows[k]?.length).map((kind) => (
              <div key={kind}>
                <h3
                  className="heading-5"
                  style={{ marginBottom: 'var(--space-2)', textTransform: 'capitalize', color: 'var(--color-text-secondary)' }}
                >
                  {kind}
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  {groupedRows[kind].map((row) => {
                    const writerName = row.writtenBy ? agentNameById.get(row.writtenBy) ?? 'Unknown agent' : null;
                    return (
                      <div
                        key={row.id}
                        className="glass-panel"
                        style={{
                          padding: 'var(--space-4) var(--space-4) var(--space-4) var(--space-5)',
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 'var(--space-3)',
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-1)' }}>
                            <span
                              className="badge"
                              style={{
                                fontSize: 11,
                                padding: '2px 8px',
                                borderRadius: 999,
                                ...kindBadgeStyle(row.kind),
                              }}
                            >
                              {row.kind}
                            </span>
                            <span style={{ fontFamily: 'var(--font-family-mono, monospace)', fontWeight: 500 }}>
                              {row.key}
                            </span>
                          </div>
                          <div className="text-sm" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginBottom: 'var(--space-2)' }}>
                            {row.content}
                          </div>
                          <div className="text-xs text-tertiary" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                            {writerName ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <Bot size={12} /> {writerName}
                              </span>
                            ) : (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <User size={12} /> Human
                              </span>
                            )}
                            <span>· {relativeAgo(row.updatedAt)}</span>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 'var(--space-1)', flexShrink: 0 }}>
                          <button className="btn btn-ghost btn-icon btn-sm" title="Edit" onClick={() => openEdit(row)}>
                            <Pencil size={14} />
                          </button>
                          <button className="btn btn-ghost btn-icon btn-sm" title="Delete" onClick={() => remove(row.key)}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 'var(--space-6) var(--space-6) var(--space-4)',
              }}
            >
              <h2 className="heading-3">{editingKey ? `Edit "${editingKey}"` : 'Add project memory'}</h2>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowAdd(false)}>
                <X size={16} />
              </button>
            </div>
            <div style={{ padding: '0 var(--space-6) var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div className="form-group">
                <label className="form-label">Key</label>
                <input
                  className="input"
                  placeholder="billing-deferred-to-v2"
                  value={form.key}
                  onChange={(e) => setForm({ ...form, key: e.target.value })}
                  disabled={!!editingKey}
                  style={{ fontFamily: 'var(--font-family-mono, monospace)' }}
                />
                {editingKey && (
                  <div className="text-xs text-tertiary" style={{ marginTop: 4 }}>
                    Key is the unique handle agents use to address this memory. To rename, delete and re-add.
                  </div>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Kind</label>
                <select
                  className="input"
                  value={form.kind}
                  onChange={(e) => setForm({ ...form, kind: e.target.value as ProjectMemoryRow['kind'] })}
                >
                  <option value="decision">decision — something the team chose</option>
                  <option value="glossary">glossary — a term definition</option>
                  <option value="convention">convention — a rule we follow</option>
                  <option value="fact">fact — an observation about the project</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Content</label>
                <textarea
                  className="input textarea"
                  style={{ minHeight: 120 }}
                  placeholder="We decided to ship without billing in v1; revisit in Q3."
                  value={form.content}
                  onChange={(e) => setForm({ ...form, content: e.target.value })}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
                <button className="btn btn-secondary" onClick={() => setShowAdd(false)}>
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  onClick={save}
                  disabled={saving || !form.key.trim() || !form.content.trim()}
                >
                  {saving ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}
                  {editingKey ? 'Save changes' : 'Add memory'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
