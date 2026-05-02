'use client';
import { useState, useEffect, useCallback } from 'react';
import { X, Loader2, Save, Plus, Trash2, FileText, Brain, Activity, BookOpen, RefreshCw, Zap, Sparkles, History } from 'lucide-react';
import { useToast } from '@/components/Toast';
import { aggregateRetrievalsByKey, type RetrievalAggregate } from '@/lib/retrievalAudit';

interface Agent {
  id: string; name: string; role: string; roleLabel: string; description: string | null;
  systemPrompt: string; soulMd?: string | null; modelProvider: string; modelName: string; temperature: number; isActive: boolean;
  plugins?: string[]; skills?: string[]; perpetual?: boolean; scheduleCron?: string | null;
  projectId?: string | null;
}
interface Memory { id: string; key: string; content: string; kind: string; source: string; sourceRef: string | null; updatedAt: string; }
interface ActivityEvent { id: string; eventType: string; payload: any; createdAt: string; }
interface ContextSnapshot { agentId: string; content: string; stale: boolean; updatedAt: string | null; }

type Tab = 'identity' | 'soul' | 'capabilities' | 'memory' | 'retrievals' | 'context' | 'activity' | 'compiled';

export default function AgentHarnessModal({ agent, onClose, onUpdate }: { agent: Agent; onClose: () => void; onUpdate?: (a: Agent) => void }) {
  const [tab, setTab] = useState<Tab>('identity');
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: 960, width: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-5) var(--space-6) var(--space-3)', borderBottom: '1px solid var(--color-surface-border)' }}>
          <div>
            <h2 className="heading-3">{agent.name}</h2>
            <div className="text-tertiary text-xs">{agent.roleLabel} · harness</div>
          </div>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose}><X size={16} /></button>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-1)', padding: 'var(--space-2) var(--space-4)', borderBottom: '1px solid var(--color-surface-border)' }}>
            {([
              { id: 'identity', label: 'AGENT.md', icon: FileText },
              { id: 'soul', label: 'SOUL.md', icon: Sparkles },
              { id: 'capabilities', label: 'Capabilities', icon: Zap },
              { id: 'memory', label: 'MEMORY.md', icon: Brain },
              { id: 'retrievals', label: 'Retrievals', icon: History },
              { id: 'context', label: 'CONTEXT.md', icon: BookOpen },
              { id: 'activity', label: 'ACTIVITY.log', icon: Activity },
              { id: 'compiled', label: 'Compiled', icon: RefreshCw },
            ] as const).map(t => (
              <button key={t.id} className={`btn btn-sm ${tab === t.id ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab(t.id)}>
                <t.icon size={12} />{t.label}
              </button>
            ))}
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: 'var(--space-5) var(--space-6)' }}>
          {tab === 'identity' && <IdentityPanel agent={agent} onUpdate={onUpdate} />}
          {tab === 'soul' && <SoulPanel agent={agent} onUpdate={onUpdate} />}
          {tab === 'capabilities' && <CapabilitiesPanel agent={agent} onUpdate={onUpdate} />}
          {tab === 'memory' && <MemoryPanel agentId={agent.id} />}
          {tab === 'retrievals' && <RetrievalsPanel agentId={agent.id} />}
          {tab === 'context' && <ContextPanel agentId={agent.id} />}
          {tab === 'activity' && <ActivityPanel agentId={agent.id} />}
          {tab === 'compiled' && <CompiledPanel agentId={agent.id} />}
        </div>
      </div>
    </div>
  );
}

function IdentityPanel({ agent, onUpdate }: { agent: Agent; onUpdate?: (a: Agent) => void }) {
  const [form, setForm] = useState({ name: agent.name, description: agent.description || '', systemPrompt: agent.systemPrompt, temperature: agent.temperature });
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/agents/${agent.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      if (res.ok) {
        const a = await res.json();
        onUpdate?.(a);
        toast.success('AGENT.md saved');
      } else {
        toast.error(`Save failed (${res.status})`);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Save failed');
    } finally { setSaving(false); }
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div className="form-group"><label className="form-label">Name</label><input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
      <div className="form-group"><label className="form-label">Description</label><input className="input" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
      <div className="form-group"><label className="form-label">System Prompt</label><textarea className="input textarea" style={{ minHeight: 180, fontFamily: 'var(--font-family-mono, monospace)' }} value={form.systemPrompt} onChange={e => setForm({ ...form, systemPrompt: e.target.value })} /></div>
      <div className="form-group"><label className="form-label">Temperature: {form.temperature}</label><input type="range" min="0" max="2" step="0.1" value={form.temperature} onChange={e => setForm({ ...form, temperature: parseFloat(e.target.value) })} /></div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />}Save</button>
      </div>
    </div>
  );
}

function SoulPanel({ agent, onUpdate }: { agent: Agent; onUpdate?: (a: Agent) => void }) {
  const [soulMd, setSoulMd] = useState<string>(agent.soulMd || '');
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [reloading, setReloading] = useState(false);
  const toast = useToast();

  const dirty = soulMd !== (agent.soulMd || '');

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/agents/${agent.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ soulMd }),
      });
      if (res.ok) {
        const a = await res.json();
        onUpdate?.(a);
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 2000);
        toast.success('SOUL.md saved');
      } else {
        toast.error(`Save failed (${res.status})`);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Save failed');
    } finally { setSaving(false); }
  };

  const reloadFromTemplate = async () => {
    if (soulMd && !confirm('Replace SOUL.md with the role default? Your edits will be lost.')) return;
    setReloading(true);
    try {
      const res = await fetch(`/api/agents/templates/${agent.role}`);
      if (res.ok) {
        const data = await res.json();
        setSoulMd(data.soulMd || '');
      }
    } finally { setReloading(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <p className="text-sm text-tertiary" style={{ marginTop: 0 }}>
        SOUL.md is this agent&apos;s voice — brutally specific guidance on how it sounds, what it never says, and what &quot;good&quot; looks like.
        It loads near the top of the system prompt so the model adopts the voice before reading the operational instructions.
        Generic SOUL → generic agent. Be opinionated.
      </p>
      <textarea
        className="input textarea"
        style={{ minHeight: 380, fontFamily: 'var(--font-family-mono, monospace)', fontSize: 'var(--font-size-sm)' }}
        value={soulMd}
        onChange={(e) => setSoulMd(e.target.value)}
        placeholder={`# SOUL — ${agent.roleLabel}\n\n## Voice\n- ...\n\n## Mandatory\n- ...\n\n## Banned\n- ...\n\n## What "good" looks like\n...\n\n## What "bad" looks like\n...`}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-2)' }}>
        <button className="btn btn-ghost btn-sm" onClick={reloadFromTemplate} disabled={reloading}>
          {reloading ? <Loader2 size={12} className="spin" /> : <RefreshCw size={12} />} Reload from {agent.role} template
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          {savedFlash && <span className="text-xs" style={{ color: 'var(--color-success)' }}>Saved</span>}
          <button className="btn btn-primary btn-sm" onClick={save} disabled={saving || !dirty}>
            {saving ? <Loader2 size={12} className="spin" /> : <Save size={12} />} Save SOUL.md
          </button>
        </div>
      </div>
    </div>
  );
}

function MemoryPanel({ agentId }: { agentId: string }) {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Memory | null>(null);
  const [form, setForm] = useState({ key: '', content: '', kind: 'fact' });
  // Memory v4 / Phase 4 — retrieval audit. Aggregates the agent's recent
  // memory_retrieved events into a per-key map of { count, recent[] } so
  // each memory row can show "pulled into N runs / 30d" with hover details.
  // The aggregation logic is in src/lib/retrievalAudit.ts (testable without React).
  const [retrievals, setRetrievals] = useState<Record<string, RetrievalAggregate>>({});
  const toast = useToast();

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/agents/${agentId}/memory`).then(r => r.json()).then(setMemories).finally(() => setLoading(false));
    // Pull the last 100 memory_retrieved events. Cheap aggregation: walk
    // payload.retrieved[].key, bump counts, keep the 3 most-recent timestamps
    // + scores per key. Limit 100 events ≈ 100 runs, far more than the
    // settings UI needs to show "pull frequency over 30 days".
    fetch(`/api/agents/${agentId}/activity?type=memory_retrieved&limit=100`)
      .then(r => r.json())
      .then((events: ActivityEvent[]) => setRetrievals(aggregateRetrievalsByKey(events)))
      .catch(() => setRetrievals({}));
  }, [agentId]);
  useEffect(load, [load]);

  const save = async () => {
    if (!form.key.trim() || !form.content.trim()) return;
    const wasEditing = !!editing;
    const res = await fetch(`/api/agents/${agentId}/memory`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    if (res.ok) {
      toast.success(wasEditing ? 'Memory updated' : 'Memory added');
    } else {
      toast.error(`Failed to save memory (${res.status})`);
    }
    setForm({ key: '', content: '', kind: 'fact' });
    setEditing(null);
    load();
  };
  const remove = async (key: string) => {
    if (!confirm(`Delete memory "${key}"?`)) return;
    const res = await fetch(`/api/agents/${agentId}/memory/${encodeURIComponent(key)}`, { method: 'DELETE' });
    if (res.ok) toast.success('Memory deleted');
    else toast.error(`Delete failed (${res.status})`);
    load();
  };

  if (loading) return <Loader2 size={20} className="spin" />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div className="glass-panel" style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <div style={{ fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-sm)' }}>{editing ? 'Edit memory' : 'Add memory'}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--space-3)' }}>
          <input className="input" placeholder="key (e.g. preferred-language)" value={form.key} onChange={e => setForm({ ...form, key: e.target.value })} disabled={!!editing} />
          <select className="input" value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })}>
            <option value="fact">fact</option>
            <option value="preference">preference</option>
            <option value="decision">decision</option>
            <option value="context">context</option>
          </select>
        </div>
        <textarea className="input textarea" style={{ minHeight: 80 }} placeholder="content" value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} />
        <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
          {editing && <button className="btn btn-ghost btn-sm" onClick={() => { setEditing(null); setForm({ key: '', content: '', kind: 'fact' }); }}>Cancel</button>}
          <button className="btn btn-primary btn-sm" onClick={save}><Plus size={12} />{editing ? 'Update' : 'Add'}</button>
        </div>
      </div>

      {memories.length === 0 ? (
        <div className="text-tertiary text-sm" style={{ padding: 'var(--space-4)', textAlign: 'center' }}>No memories yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {memories.map(m => {
            const agg = retrievals[m.key];
            const tooltip = agg
              ? `Last ${agg.recent.length} retrievals:\n` + agg.recent.map(r =>
                  `  ${new Date(r.ts).toLocaleString()}${r.score != null ? ` · score ${r.score.toFixed(3)}` : ''}`,
                ).join('\n')
              : 'Not retrieved in the last 30 days';
            return (
            <div key={m.id} className="glass-card" style={{ padding: 'var(--space-3) var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <span className="badge" style={{ background: 'var(--color-accent-muted)', color: 'var(--color-accent)' }}>{m.kind}</span>
                <span style={{ fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-sm)', fontFamily: 'var(--font-family-mono, monospace)' }}>{m.key}</span>
                {agg && (
                  <span
                    className="badge"
                    style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', fontSize: 11, cursor: 'help' }}
                    title={tooltip}
                  >
                    <History size={10} /> {agg.count} pull{agg.count === 1 ? '' : 's'} / 30d
                  </span>
                )}
                <span className="text-tertiary text-xs" style={{ marginLeft: 'auto' }}>{m.source}</span>
                <button className="btn btn-ghost btn-icon btn-sm" onClick={() => { setEditing(m); setForm({ key: m.key, content: m.content, kind: m.kind }); }}><FileText size={12} /></button>
                <button className="btn btn-ghost btn-icon btn-sm" onClick={() => remove(m.key)}><Trash2 size={12} /></button>
              </div>
              <div className="text-secondary text-sm" style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
            </div>
          );
          })}
        </div>
      )}
    </div>
  );
}

function ContextPanel({ agentId }: { agentId: string }) {
  const [snapshot, setSnapshot] = useState<ContextSnapshot | null>(null);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    fetch(`/api/agents/${agentId}/context`).then(r => r.json()).then((s) => { setSnapshot(s); setContent(s.content || ''); }).finally(() => setLoading(false));
  }, [agentId]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/context`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content, stale: false }) });
      if (res.ok) {
        setSnapshot(await res.json());
        toast.success('CONTEXT.md saved');
      } else {
        toast.error(`Save failed (${res.status})`);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Save failed');
    } finally { setSaving(false); }
  };

  if (loading) return <Loader2 size={20} className="spin" />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      {snapshot?.stale && <div className="badge badge-warning" style={{ alignSelf: 'flex-start' }}>stale · events since last rewrite</div>}
      <textarea className="input textarea" style={{ minHeight: 300, fontFamily: 'var(--font-family-mono, monospace)' }} value={content} onChange={e => setContent(e.target.value)} placeholder="Rolling context snapshot. The agent rewrites this to summarize what it currently knows about the work in flight." />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="text-tertiary text-xs">{snapshot?.updatedAt ? `Updated ${new Date(snapshot.updatedAt).toLocaleString()}` : 'Never saved'}</span>
        <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>{saving ? <Loader2 size={12} className="spin" /> : <Save size={12} />}Save</button>
      </div>
    </div>
  );
}

// Memory v4 / Phase 4 — retrievals view.
// Renders memory_retrieved + project_memory_retrieved events as a clean
// per-run timeline: when did this agent fetch which memories with what
// query? Distinct from the general Activity tab (everything) — this view
// is the audit surface for memory pulls specifically, so noise from card
// updates / chat events is filtered out.
function RetrievalsPanel({ agentId }: { agentId: string }) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [oldestTs, setOldestTs] = useState<string | null>(null);
  const [reachedEnd, setReachedEnd] = useState(false);

  const fetchPage = useCallback(async (before: string | null) => {
    const url = new URL(`/api/agents/${agentId}/activity`, window.location.origin);
    url.searchParams.set('type', 'memory_retrieved,project_memory_retrieved');
    url.searchParams.set('limit', '50');
    if (before) url.searchParams.set('before', before);
    const res = await fetch(url.toString());
    if (!res.ok) return [];
    return (await res.json()) as ActivityEvent[];
  }, [agentId]);

  useEffect(() => {
    setLoading(true);
    fetchPage(null).then((page) => {
      setEvents(page);
      setOldestTs(page.length > 0 ? page[page.length - 1].createdAt : null);
      setReachedEnd(page.length < 50);
    }).finally(() => setLoading(false));
  }, [fetchPage]);

  const loadMore = async () => {
    if (!oldestTs || reachedEnd) return;
    setLoading(true);
    const next = await fetchPage(oldestTs);
    setEvents(prev => [...prev, ...next]);
    setOldestTs(next.length > 0 ? next[next.length - 1].createdAt : oldestTs);
    setReachedEnd(next.length < 50);
    setLoading(false);
  };

  if (loading && events.length === 0) return <Loader2 size={20} className="spin" />;
  if (events.length === 0) return (
    <div className="text-tertiary text-sm" style={{ padding: 'var(--space-4)', textAlign: 'center' }}>
      No memory retrievals recorded yet. The harness writes a memory_retrieved event whenever it pulls memory for an agent run with OPENAI_API_KEY set.
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      {events.map(e => {
        const isProject = e.eventType === 'project_memory_retrieved';
        const retrieved: Array<{ key: string; score: number | null }> = e.payload?.retrieved || [];
        const query: string = e.payload?.query || '';
        return (
          <div key={e.id} className="glass-card" style={{ padding: 'var(--space-3) var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <span className="text-tertiary text-xs">{new Date(e.createdAt).toLocaleString()}</span>
              <span
                className="badge"
                style={{
                  background: isProject ? 'rgba(99,102,241,0.15)' : 'var(--color-accent-muted)',
                  color: isProject ? '#a5b4fc' : 'var(--color-accent)',
                  fontSize: 11,
                }}
              >
                {isProject ? 'project' : 'agent'}
              </span>
              <span className="text-tertiary text-xs">{retrieved.length} keys</span>
            </div>
            {query && (
              <div
                className="text-secondary text-xs"
                style={{
                  fontFamily: 'var(--font-family-mono, monospace)',
                  background: 'var(--color-bg-tertiary)',
                  padding: 'var(--space-2) var(--space-3)',
                  borderRadius: 'var(--radius-sm)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
                title="The trigger text the agent embedded against (truncated to 200 chars)"
              >
                {query}
              </div>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)' }}>
              {retrieved.map(r => (
                <span
                  key={r.key}
                  className="badge"
                  style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)', fontSize: 11, fontFamily: 'var(--font-family-mono, monospace)' }}
                  title={r.score != null ? `cosine similarity ${r.score.toFixed(4)}` : 'always-include row (preference / recent decision)'}
                >
                  {r.key}{r.score != null ? ` · ${r.score.toFixed(2)}` : ''}
                </span>
              ))}
            </div>
          </div>
        );
      })}
      {!reachedEnd && (
        <button className="btn btn-secondary btn-sm" onClick={loadMore} disabled={loading} style={{ alignSelf: 'center', marginTop: 'var(--space-2)' }}>
          {loading ? <Loader2 size={12} className="spin" /> : 'Load older'}
        </button>
      )}
    </div>
  );
}

function ActivityPanel({ agentId }: { agentId: string }) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch(`/api/agents/${agentId}/activity?limit=100`).then(r => r.json()).then(setEvents).finally(() => setLoading(false));
  }, [agentId]);

  if (loading) return <Loader2 size={20} className="spin" />;
  if (events.length === 0) return <div className="text-tertiary text-sm" style={{ padding: 'var(--space-4)', textAlign: 'center' }}>No activity yet.</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', fontFamily: 'var(--font-family-mono, monospace)', fontSize: 'var(--font-size-xs)' }}>
      {events.map(e => (
        <div key={e.id} className="glass-card" style={{ padding: 'var(--space-2) var(--space-3)' }}>
          <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
            <span className="text-tertiary">{new Date(e.createdAt).toLocaleString()}</span>
            <span className="badge" style={{ background: 'var(--color-accent-muted)', color: 'var(--color-accent)' }}>{e.eventType}</span>
          </div>
          <div className="text-secondary" style={{ marginTop: 4, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{JSON.stringify(e.payload, null, 2)}</div>
        </div>
      ))}
    </div>
  );
}

const AVAILABLE_PLUGINS: Array<{ name: string; label: string; description: string }> = [
  { name: 'kanban', label: 'Kanban', description: 'Cards, columns, checklists, members' },
  { name: 'about', label: 'About', description: 'Propose project About updates' },
  { name: 'coding', label: 'Coding', description: 'start_coding_task → PR via code automation' },
  { name: 'shell', label: 'Shell (exec_shell)', description: 'Raw shell in the project sandbox. Powerful — enable deliberately.' },
  { name: 'skills', label: 'Skills', description: 'Invoke installed ClawHub skills (use_skill / end_skill / list_skills)' },
  { name: 'subagent', label: 'Sub-agents', description: 'spawn_subagent — child runs, capped at depth 3' },
  { name: 'scheduler', label: 'Scheduler', description: 'schedule_task — persist reminders and recurring tasks. Enable so the agent can honor "remind me…" requests.' },
];

function CapabilitiesPanel({ agent, onUpdate }: { agent: Agent; onUpdate?: (a: Agent) => void }) {
  const [plugins, setPlugins] = useState<string[]>(agent.plugins || []);
  const [skills, setSkills] = useState<string[]>(agent.skills || []);
  const [perpetual, setPerpetual] = useState<boolean>(!!agent.perpetual);
  const [scheduleCron, setScheduleCron] = useState<string>(agent.scheduleCron || '');
  const [projectSkills, setProjectSkills] = useState<Array<{ slug: string; description: string; enabled: boolean }>>([]);
  const [subs, setSubs] = useState<Array<{ id: string; source: string; sourceRef: string; enabled: boolean; lastEventAt: string | null; sessionKeyTemplate?: string | null }>>([]);
  const [subSource, setSubSource] = useState('discord:channel');
  const [subRef, setSubRef] = useState('');
  const [subSessTpl, setSubSessTpl] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadingSubs, setLoadingSubs] = useState(true);
  const toast = useToast();

  useEffect(() => {
    if (agent.projectId) {
      fetch(`/api/projects/${agent.projectId}/skills`).then(r => r.json()).then((j) => {
        setProjectSkills((j.installed || []).map((s: any) => ({ slug: s.slug, description: s.description, enabled: s.enabled })));
      }).catch(() => {});
    }
    fetch(`/api/agents/${agent.id}/subscriptions`).then(r => r.json()).then((j) => {
      setSubs(j.subscriptions || []);
    }).finally(() => setLoadingSubs(false));
  }, [agent.id, agent.projectId]);

  const togglePlugin = (n: string) => setPlugins((p) => p.includes(n) ? p.filter((x) => x !== n) : [...p, n]);
  const toggleSkill = (s: string) => setSkills((p) => p.includes(s) ? p.filter((x) => x !== s) : [...p, s]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/agents/${agent.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plugins, skills, perpetual, scheduleCron: scheduleCron.trim() || null }),
      });
      if (res.ok) {
        const a = await res.json();
        onUpdate?.(a);
        toast.success('Capabilities saved');
      } else {
        toast.error(`Save failed (${res.status})`);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Save failed');
    } finally { setSaving(false); }
  };

  const addSub = async () => {
    if (!subRef.trim()) return;
    const r = await fetch(`/api/agents/${agent.id}/subscriptions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: subSource,
        sourceRef: subRef.trim(),
        sessionKeyTemplate: subSessTpl.trim() || undefined,
      }),
    });
    if (r.ok) {
      const j = await r.json();
      setSubs((s) => [j.subscription, ...s]);
      setSubRef(''); setSubSessTpl('');
      toast.success('Subscription added');
    } else {
      toast.error(`Add subscription failed (${r.status})`);
    }
  };
  const delSub = async (id: string) => {
    const r = await fetch(`/api/agents/${agent.id}/subscriptions?subscriptionId=${id}`, { method: 'DELETE' });
    if (r.ok) {
      setSubs((s) => s.filter((x) => x.id !== id));
      toast.success('Subscription removed');
    } else {
      toast.error(`Delete failed (${r.status})`);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      <section>
        <h3 className="heading-4" style={{ marginBottom: 'var(--space-2)' }}>Plugins</h3>
        <p className="text-tertiary text-xs" style={{ marginBottom: 'var(--space-3)' }}>
          Enabled plugins contribute their tools to this agent&apos;s LLM toolset. Leave empty to use legacy defaults (kanban + about + coding).
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 'var(--space-2)' }}>
          {AVAILABLE_PLUGINS.map((p) => (
            <label key={p.name} className="glass-panel" style={{ padding: 'var(--space-3)', display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-start', cursor: 'pointer' }}>
              <input type="checkbox" checked={plugins.includes(p.name)} onChange={() => togglePlugin(p.name)} />
              <div>
                <div style={{ fontWeight: 'var(--font-weight-medium)' }}>{p.label}</div>
                <div className="text-xs text-tertiary">{p.description}</div>
              </div>
            </label>
          ))}
        </div>
      </section>

      <section>
        <h3 className="heading-4" style={{ marginBottom: 'var(--space-2)' }}>Skills available to this agent</h3>
        {projectSkills.length === 0 ? (
          <p className="text-tertiary text-xs">No skills installed on this project yet. Go to project Settings → Skills.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {projectSkills.map((s) => (
              <label key={s.slug} className="glass-panel" style={{ padding: 'var(--space-3)', display: 'flex', gap: 'var(--space-2)', alignItems: 'center', cursor: 'pointer' }}>
                <input type="checkbox" checked={skills.includes(s.slug)} onChange={() => toggleSkill(s.slug)} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: 'var(--font-family-mono, monospace)' }}>{s.slug}</div>
                  <div className="text-xs text-tertiary">{s.description}</div>
                </div>
                {!s.enabled && <span className="badge">disabled</span>}
              </label>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="heading-4" style={{ marginBottom: 'var(--space-2)' }}>Perpetual operation</h3>
        <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
          <input type="checkbox" checked={perpetual} onChange={(e) => setPerpetual(e.target.checked)} />
          Run perpetually (driven by webhooks and/or cron)
        </label>
        {perpetual && (
          <div>
            <label className="form-label">Schedule cron</label>
            <input className="input" placeholder="*/15 * * * *" value={scheduleCron} onChange={(e) => setScheduleCron(e.target.value)} />
            <p className="text-tertiary text-xs" style={{ marginTop: 'var(--space-1)' }}>
              Minute/hour/day/month/weekday, standard cron. Leave empty for webhook-only agents.
            </p>
          </div>
        )}
      </section>

      <section>
        <h3 className="heading-4" style={{ marginBottom: 'var(--space-2)' }}>Subscriptions</h3>
        <p className="text-tertiary text-xs" style={{ marginBottom: 'var(--space-2)' }}>
          Inbound bindings for webhook triggers. A matching <code>/api/webhooks/&lt;plugin&gt;/&lt;slug&gt;</code> POST fires the agent.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <select className="input" style={{ maxWidth: 200 }} value={subSource} onChange={(e) => setSubSource(e.target.value)}>
              <option value="discord:channel">discord:channel</option>
              <option value="reddit:subreddit">reddit:subreddit</option>
              <option value="x:mentions">x:mentions</option>
              <option value="webhook:generic">webhook:generic</option>
            </select>
            <input className="input" placeholder="sourceRef (channel id, subreddit name, handle, …)" value={subRef} onChange={(e) => setSubRef(e.target.value)} />
            <button className="btn btn-secondary" onClick={addSub}>Add</button>
          </div>
          <input
            className="input"
            placeholder="Session key template (optional, e.g. discord:{{channel.id}}:{{sender.id}})"
            value={subSessTpl}
            onChange={(e) => setSubSessTpl(e.target.value)}
          />
          <p className="text-tertiary text-xs">
            Template variables come from the webhook payload. Events with the same resolved key share a transcript and run serialized. Leave blank for per-sender default.
          </p>
        </div>
        {loadingSubs ? <Loader2 size={14} className="spin" /> : subs.length === 0 ? (
          <p className="text-tertiary text-xs">No subscriptions yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
            {subs.map((s) => (
              <div key={s.id} className="glass-panel" style={{ padding: 'var(--space-2) var(--space-3)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <span style={{ fontFamily: 'var(--font-family-mono, monospace)', fontSize: 12 }}>{s.source} · {s.sourceRef}</span>
                <span className="text-tertiary text-xs" style={{ flex: 1 }}>{s.lastEventAt ? `last: ${new Date(s.lastEventAt).toLocaleString()}` : 'no events yet'}</span>
                <button className="btn btn-ghost btn-icon btn-sm" onClick={() => delSub(s.id)}><Trash2 size={12} /></button>
              </div>
            ))}
          </div>
        )}
      </section>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />} Save capabilities
        </button>
      </div>
    </div>
  );
}

function CompiledPanel({ agentId }: { agentId: string }) {
  const [compiled, setCompiled] = useState('');
  const [loading, setLoading] = useState(true);
  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/agents/${agentId}/context?mode=compiled`).then(r => r.json()).then((d) => setCompiled(d.compiled || '')).finally(() => setLoading(false));
  }, [agentId]);
  useEffect(load, [load]);
  if (loading) return <Loader2 size={20} className="spin" />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="text-tertiary text-xs">This is what gets sent to the model as the system prompt harness.</span>
        <button className="btn btn-ghost btn-sm" onClick={load}><RefreshCw size={12} />Refresh</button>
      </div>
      <pre className="glass-panel" style={{ padding: 'var(--space-4)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'var(--font-family-mono, monospace)', fontSize: 'var(--font-size-xs)', maxHeight: 500, overflow: 'auto' }}>{compiled}</pre>
    </div>
  );
}
