'use client';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Key, Plus, Trash2, Loader2, CheckCircle2, AlertCircle, X, Settings as SettingsIcon, Code2, ChevronRight, Sparkles, KeyRound, Box, Clock, BookOpen, Terminal } from 'lucide-react';
import { useToast } from '@/components/Toast';

interface ModelKeyData { id: string; provider: string; label: string | null; isValid: boolean; lastUsedAt: string | null; createdAt: string; }

export default function ProjectSettingsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const toast = useToast();
  const [keys, setKeys] = useState<ModelKeyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ provider: 'anthropic', key: '', label: '' });

  useEffect(() => {
    fetch(`/api/model-keys?projectId=${projectId}`).then((r) => r.json()).then(setKeys).catch(() => {}).finally(() => setLoading(false));
  }, [projectId]);

  const fetchKeys = async () => { try { const res = await fetch(`/api/model-keys?projectId=${projectId}`); if (res.ok) setKeys(await res.json()); } catch {} };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.key.trim()) return;
    setAdding(true);
    try {
      const res = await fetch('/api/model-keys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, projectId }) });
      if (res.ok) {
        setShowAdd(false);
        setForm({ provider: 'anthropic', key: '', label: '' });
        fetchKeys();
        toast.success('API key saved');
      } else {
        const body = await res.json().catch(() => ({}));
        toast.error(body?.error || `Save failed (${res.status})`);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Save failed');
    } finally { setAdding(false); }
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/model-keys/${id}`, { method: 'DELETE' });
    if (res.ok) {
      toast.success('API key removed');
    } else {
      toast.error(`Delete failed (${res.status})`);
    }
    fetchKeys();
  };

  return (
    <div style={{ padding: 'var(--space-8)', maxWidth: 800, margin: '0 auto' }}>
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h1 className="heading-2" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <SettingsIcon size={24} style={{ color: 'var(--color-accent)' }} />
          Project Settings
        </h1>
        <p className="text-secondary" style={{ marginTop: 'var(--space-1)' }}>Manage API keys and project configuration</p>
      </div>

      {/* Default agent capabilities — applies to newly-created agents in this project */}
      <AgentDefaultsPanel projectId={projectId} />

      {/* Doctrine — USER.md & AGENTS.md, inherited by every agent in the project */}
      <Link href={`/p/${projectId}/settings/doctrine`} className="glass-panel" style={{ padding: 'var(--space-5) var(--space-6)', marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', textDecoration: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', color: 'var(--color-accent)' }}>
          <BookOpen size={20} />
          <div>
            <h2 className="heading-4">Doctrine — USER.md &amp; AGENTS.md</h2>
            <p className="text-sm text-tertiary">Who the agents serve and the house rules they all follow. Admin-only.</p>
          </div>
        </div>
        <ChevronRight size={18} style={{ color: 'var(--color-text-tertiary)' }} />
      </Link>

      {/* Code Automation */}
      <Link href={`/p/${projectId}/settings/code`} className="glass-panel" style={{ padding: 'var(--space-5) var(--space-6)', marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', textDecoration: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', color: 'var(--color-accent)' }}>
          <Code2 size={20} />
          <div>
            <h2 className="heading-4">Code Automation</h2>
            <p className="text-sm text-tertiary">Let agents open pull requests against your repo from kanban cards.</p>
          </div>
        </div>
        <ChevronRight size={18} style={{ color: 'var(--color-text-tertiary)' }} />
      </Link>

      {/* Skills */}
      <Link href={`/p/${projectId}/settings/skills`} className="glass-panel" style={{ padding: 'var(--space-5) var(--space-6)', marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', textDecoration: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', color: 'var(--color-accent)' }}>
          <Sparkles size={20} />
          <div>
            <h2 className="heading-4">Skills</h2>
            <p className="text-sm text-tertiary">Install ClawHub / OpenClaw-format skills. Each skill runs inside the project sandbox.</p>
          </div>
        </div>
        <ChevronRight size={18} style={{ color: 'var(--color-text-tertiary)' }} />
      </Link>

      {/* Secrets */}
      <Link href={`/p/${projectId}/settings/secrets`} className="glass-panel" style={{ padding: 'var(--space-5) var(--space-6)', marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', textDecoration: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', color: 'var(--color-accent)' }}>
          <KeyRound size={20} />
          <div>
            <h2 className="heading-4">Project Secrets</h2>
            <p className="text-sm text-tertiary">Env vars / files injected into sandbox exec. Referenced by skills via requires.env.</p>
          </div>
        </div>
        <ChevronRight size={18} style={{ color: 'var(--color-text-tertiary)' }} />
      </Link>

      {/* Schedules */}
      <Link href={`/p/${projectId}/settings/schedules`} className="glass-panel" style={{ padding: 'var(--space-5) var(--space-6)', marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', textDecoration: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', color: 'var(--color-accent)' }}>
          <Clock size={20} />
          <div>
            <h2 className="heading-4">Scheduled tasks</h2>
            <p className="text-sm text-tertiary">Reminders and recurring runs. Agents can create these via <code>schedule_task</code>, or you can add them manually.</p>
          </div>
        </div>
        <ChevronRight size={18} style={{ color: 'var(--color-text-tertiary)' }} />
      </Link>

      {/* Sandbox */}
      <Link href={`/p/${projectId}/settings/sandbox`} className="glass-panel" style={{ padding: 'var(--space-5) var(--space-6)', marginBottom: 'var(--space-6)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', textDecoration: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', color: 'var(--color-accent)' }}>
          <Box size={20} />
          <div>
            <h2 className="heading-4">Sandbox</h2>
            <p className="text-sm text-tertiary">Where shell commands from agents run — local dev, SSH devbox, or OpenShell.</p>
          </div>
        </div>
        <ChevronRight size={18} style={{ color: 'var(--color-text-tertiary)' }} />
      </Link>

      {/* API Keys */}
      <div className="glass-panel" style={{ padding: 'var(--space-6)', marginBottom: 'var(--space-6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-5)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', color: 'var(--color-accent)' }}>
            <Key size={20} /><div><h2 className="heading-4">AI Provider Keys</h2><p className="text-sm text-tertiary">Add your API keys to enable AI agents in this project</p></div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}><Plus size={14} />Add Key</button>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-6)', color: 'var(--color-text-tertiary)' }}><Loader2 size={20} className="spin" /></div>
        ) : keys.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-8)', textAlign: 'center' }}>
            <Key size={32} style={{ color: 'var(--color-accent)', opacity: 0.3 }} /><p className="text-secondary">No API keys configured</p><p className="text-xs text-tertiary">Add an OpenAI or Anthropic key to power your AI agents</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {keys.map((key) => (
              <div key={key.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-3) var(--space-4)', background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-surface-border)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                  <span style={{ fontWeight: 'var(--font-weight-medium)' }}>{key.provider === 'anthropic' ? '🟣' : '🟢'} {key.provider.charAt(0).toUpperCase() + key.provider.slice(1)}</span>
                  {key.label && <span className="text-sm text-secondary">{key.label}</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  {key.isValid ? <span className="badge badge-success"><CheckCircle2 size={12} />Valid</span> : <span className="badge badge-error"><AlertCircle size={12} />Invalid</span>}
                  <button className="btn btn-ghost btn-icon btn-sm" onClick={() => handleDelete(key.id)} title="Remove key"><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Key Modal */}
      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-6) var(--space-6) var(--space-4)' }}>
              <h2 className="heading-3">Add API Key</h2>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowAdd(false)}><X size={16} /></button>
            </div>
            <form onSubmit={handleAdd} style={{ padding: '0 var(--space-6) var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
              <div className="form-group"><label className="form-label">Provider</label><select className="input" value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })}><option value="anthropic">Anthropic (Claude)</option><option value="openai">OpenAI (GPT)</option></select></div>
              <div className="form-group"><label className="form-label">API Key</label><input className="input" type="password" placeholder={form.provider === 'anthropic' ? 'sk-ant-...' : 'sk-...'} value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} required /></div>
              <div className="form-group"><label className="form-label">Label (optional)</label><input className="input" placeholder="e.g., Production Key" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} /></div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={adding || !form.key.trim()}>{adding ? <Loader2 size={16} className="spin" /> : 'Save Key'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function AgentDefaultsPanel({ projectId }: { projectId: string }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const toast = useToast();

  useEffect(() => {
    fetch(`/api/projects/${projectId}`)
      .then((r) => r.json())
      .then((p) => setEnabled(!!p.defaultAgentShell))
      .catch(() => setEnabled(false));
  }, [projectId]);

  const toggle = async (next: boolean) => {
    setSaving(true);
    const prev = enabled;
    setEnabled(next);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultAgentShell: next }),
      });
      if (!res.ok) {
        setEnabled(prev);
        toast.error(`Save failed (${res.status})`);
      } else {
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 1500);
        toast.success(next ? 'Shell default enabled' : 'Shell default disabled');
      }
    } catch (err: any) {
      setEnabled(prev);
      toast.error(err?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="glass-panel" style={{ padding: 'var(--space-5) var(--space-6)', marginBottom: 'var(--space-4)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-4)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
          <Terminal size={20} style={{ color: 'var(--color-accent)', marginTop: 2 }} />
          <div>
            <h2 className="heading-4">Agent shell access (default)</h2>
            <p className="text-sm text-tertiary" style={{ marginTop: 4, maxWidth: 520 }}>
              When on, newly-created agents in this project get the <code>shell</code> plugin out of the box — letting Claude/OpenAI agents run terminal commands inside the project sandbox, like Claude Code or Codex CLI. Existing agents are untouched. Override per agent in the agent harness → Capabilities.
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexShrink: 0 }}>
          {savedFlash && <span className="text-xs" style={{ color: 'var(--color-success)' }}>Saved</span>}
          {enabled === null ? (
            <Loader2 size={16} className="spin" style={{ color: 'var(--color-text-tertiary)' }} />
          ) : (
            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer' }}>
              <input type="checkbox" checked={enabled} disabled={saving} onChange={(e) => toggle(e.target.checked)} />
              <span className="text-sm">{enabled ? 'On' : 'Off'}</span>
            </label>
          )}
        </div>
      </div>
    </div>
  );
}
