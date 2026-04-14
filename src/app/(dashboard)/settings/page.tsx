'use client';
import { useState, useEffect } from 'react';
import { Key, Plus, Trash2, Loader2, CheckCircle2, AlertCircle, X } from 'lucide-react';

interface ModelKeyData { id: string; provider: string; label: string | null; isValid: boolean; lastUsedAt: string | null; createdAt: string; }

export default function SettingsPage() {
  const [keys, setKeys] = useState<ModelKeyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ provider: 'anthropic', key: '', label: '' });

  useEffect(() => { fetch('/api/model-keys').then((r) => r.json()).then(setKeys).catch(() => {}).finally(() => setLoading(false)); }, []);

  const fetchKeys = async () => { try { const res = await fetch('/api/model-keys'); if (res.ok) setKeys(await res.json()); } catch {} };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.key.trim()) return;
    setAdding(true);
    try {
      const res = await fetch('/api/model-keys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      if (res.ok) { setShowAdd(false); setForm({ provider: 'anthropic', key: '', label: '' }); fetchKeys(); }
    } finally { setAdding(false); }
  };

  const handleDelete = async (id: string) => { await fetch(`/api/model-keys/${id}`, { method: 'DELETE' }); fetchKeys(); };

  return (
    <div style={{ padding: 'var(--space-8)', maxWidth: 800 }}>
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h1 className="heading-2">Settings</h1>
        <p className="text-secondary" style={{ marginTop: 'var(--space-1)' }}>Manage your workspace and API keys</p>
      </div>

      <div className="glass-panel" style={{ padding: 'var(--space-6)', marginBottom: 'var(--space-6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-5)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', color: 'var(--color-accent)' }}>
            <Key size={20} /><div><h2 className="heading-4">AI Provider Keys</h2><p className="text-sm text-tertiary">Add your API keys to enable AI agents</p></div>
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
