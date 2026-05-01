'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Clock, Plus, Trash2, Loader2, Power } from 'lucide-react';
import { useToast } from '@/components/Toast';

interface Schedule {
  id: string;
  agentId: string;
  kind: string;
  cronExpr: string | null;
  runAt: string | null;
  nextRunAt: string;
  prompt: string;
  title: string | null;
  cardId: string | null;
  enabled: boolean;
  runCount: number;
  lastRunAt: string | null;
  agent: { id: string; name: string; roleLabel: string };
}
interface AgentLite { id: string; name: string; roleLabel: string; }

export default function SchedulesPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [agents, setAgents] = useState<AgentLite[]>([]);
  const [form, setForm] = useState({ agentId: '', when: '', prompt: '', title: '' });
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const [s, a] = await Promise.all([
      fetch(`/api/projects/${projectId}/schedules`).then((r) => r.json()),
      fetch(`/api/agents?projectId=${projectId}`).then((r) => r.json()),
    ]);
    setSchedules(s.schedules || []);
    setAgents(a || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, [projectId]);

  async function create() {
    setErr(null); setSaving(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/schedules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!r.ok) {
        const msg = (await r.json()).error || 'create failed';
        setErr(msg);
        toast.error(msg);
        return;
      }
      setForm({ agentId: '', when: '', prompt: '', title: '' });
      load();
      toast.success('Schedule created');
    } finally { setSaving(false); }
  }
  async function toggle(id: string, enabled: boolean) {
    const r = await fetch(`/api/projects/${projectId}/schedules`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, enabled }),
    });
    if (r.ok) toast.success(enabled ? 'Schedule enabled' : 'Schedule paused');
    else toast.error(`Update failed (${r.status})`);
    load();
  }
  async function remove(id: string) {
    if (!confirm('Delete this schedule?')) return;
    const r = await fetch(`/api/projects/${projectId}/schedules?id=${id}`, { method: 'DELETE' });
    if (r.ok) toast.success('Schedule deleted');
    else toast.error(`Delete failed (${r.status})`);
    load();
  }

  return (
    <div style={{ padding: 'var(--space-8)', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <Link href={`/p/${projectId}/settings`} className="text-sm text-tertiary" style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)' }}>
          <ArrowLeft size={14} /> Back to settings
        </Link>
      </div>
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h1 className="heading-2" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <Clock size={24} style={{ color: 'var(--color-accent)' }} />
          Scheduled tasks
        </h1>
        <p className="text-secondary" style={{ marginTop: 'var(--space-1)' }}>
          Reminders and recurring tasks. Agents can create these via <code>schedule_task</code>; you can also add them manually here.
        </p>
      </div>

      <section className="glass-panel" style={{ padding: 'var(--space-6)', marginBottom: 'var(--space-5)' }}>
        <h2 className="heading-4" style={{ marginBottom: 'var(--space-4)' }}>Add schedule</h2>
        <div className="form-group">
          <label className="form-label">Agent</label>
          <select className="input" value={form.agentId} onChange={(e) => setForm({ ...form, agentId: e.target.value })}>
            <option value="">Select agent…</option>
            {agents.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.roleLabel})</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">When</label>
          <input className="input" placeholder="in:2m · at:2026-03-14T09:00:00Z · cron:0 9 * * 1" value={form.when} onChange={(e) => setForm({ ...form, when: e.target.value })} />
          <div className="text-xs text-tertiary" style={{ marginTop: 4 }}>
            Use <code>in:</code> for relative, <code>at:</code> for absolute ISO, <code>cron:</code> for recurring (5-field).
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Title (optional)</label>
          <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="form-label">Prompt (what the agent should do when fired)</label>
          <textarea className="input textarea" style={{ minHeight: 100 }} value={form.prompt} onChange={(e) => setForm({ ...form, prompt: e.target.value })} />
        </div>
        {err && <div className="text-sm" style={{ color: 'var(--color-danger, #ef4444)', marginBottom: 'var(--space-3)' }}>{err}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" onClick={create} disabled={saving || !form.agentId || !form.when || !form.prompt}>
            {saving ? <Loader2 size={14} className="spin" /> : <Plus size={14} />} Schedule
          </button>
        </div>
      </section>

      <section className="glass-panel" style={{ padding: 'var(--space-6)' }}>
        <h2 className="heading-4" style={{ marginBottom: 'var(--space-4)' }}>Upcoming</h2>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-4)' }}><Loader2 size={18} className="spin" /></div>
        ) : schedules.length === 0 ? (
          <div className="text-sm text-tertiary">No schedules.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {schedules.map((s) => (
              <div key={s.id} className="glass-panel" style={{ padding: 'var(--space-3) var(--space-4)', display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 500 }}>{s.title || s.prompt.slice(0, 60)}</span>
                    <span className="badge">{s.kind}</span>
                    {!s.enabled && <span className="badge badge-warn">disabled</span>}
                  </div>
                  <div className="text-xs text-tertiary" style={{ marginTop: 4 }}>
                    {s.agent.name} · next {new Date(s.nextRunAt).toLocaleString()}
                    {s.cronExpr && <> · <code>{s.cronExpr}</code></>}
                    {s.runCount > 0 && <> · fired {s.runCount}×</>}
                  </div>
                  <div className="text-sm text-secondary" style={{ marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    {s.prompt}
                  </div>
                </div>
                <button className="btn btn-ghost btn-icon btn-sm" onClick={() => toggle(s.id, !s.enabled)} title={s.enabled ? 'Disable' : 'Enable'}><Power size={14} /></button>
                <button className="btn btn-ghost btn-icon btn-sm" onClick={() => remove(s.id)} title="Delete"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
