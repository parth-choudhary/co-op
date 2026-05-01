'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, KeyRound, Plus, Trash2, Loader2 } from 'lucide-react';
import { useToast } from '@/components/Toast';

interface Secret {
  id: string;
  key: string;
  mountAs: 'env' | 'file';
  mountPath: string | null;
  description: string | null;
  updatedAt: string;
}

export default function SecretsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Secret[]>([]);
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [mountAs, setMountAs] = useState<'env' | 'file'>('env');
  const [mountPath, setMountPath] = useState('');
  const [desc, setDesc] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const r = await fetch(`/api/projects/${projectId}/secrets`);
    const j = await r.json();
    setRows(j.secrets || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, [projectId]);

  async function save() {
    setErr(null); setSaving(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/secrets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value, mountAs, mountPath: mountAs === 'file' ? mountPath : undefined, description: desc }),
      });
      if (!r.ok) {
        const msg = (await r.json()).error || 'Save failed';
        setErr(msg);
        toast.error(msg);
        return;
      }
      const savedKey = key;
      setKey(''); setValue(''); setMountPath(''); setDesc('');
      load();
      toast.success(`Secret "${savedKey}" saved`);
    } finally { setSaving(false); }
  }
  async function remove(k: string) {
    if (!confirm(`Delete secret "${k}"?`)) return;
    const r = await fetch(`/api/projects/${projectId}/secrets?key=${encodeURIComponent(k)}`, { method: 'DELETE' });
    if (r.ok) toast.success(`Secret "${k}" deleted`);
    else toast.error(`Delete failed (${r.status})`);
    load();
  }

  return (
    <div style={{ padding: 'var(--space-8)', maxWidth: 800, margin: '0 auto' }}>
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <Link href={`/p/${projectId}/settings`} className="text-sm text-tertiary" style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)' }}>
          <ArrowLeft size={14} /> Back to settings
        </Link>
      </div>
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h1 className="heading-2" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <KeyRound size={24} style={{ color: 'var(--color-accent)' }} />
          Project secrets
        </h1>
        <p className="text-secondary" style={{ marginTop: 'var(--space-1)' }}>
          Keys referenced by skills. Encrypted at rest. Injected as env vars (or files) into the sandbox at exec time — never into LLM prompts.
        </p>
      </div>

      <section className="glass-panel" style={{ padding: 'var(--space-6)', marginBottom: 'var(--space-5)' }}>
        <h2 className="heading-4" style={{ marginBottom: 'var(--space-1)' }}>Add secret</h2>
        <p className="text-sm text-tertiary" style={{ marginBottom: 'var(--space-4)' }}>Use ENV_STYLE names matching what skills&apos; <code>requires.env</code> declares.</p>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--space-3)' }}>
          <div className="form-group">
            <label className="form-label">Key</label>
            <input className="input" placeholder="GITHUB_TOKEN" value={key} onChange={(e) => setKey(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Mount as</label>
            <select className="input" value={mountAs} onChange={(e) => setMountAs(e.target.value as any)}>
              <option value="env">env var</option>
              <option value="file">file mount</option>
            </select>
          </div>
        </div>
        {mountAs === 'file' && (
          <div className="form-group">
            <label className="form-label">Mount path</label>
            <input className="input" placeholder="/home/agent/.config/gh/hosts.yml" value={mountPath} onChange={(e) => setMountPath(e.target.value)} />
          </div>
        )}
        <div className="form-group">
          <label className="form-label">Value</label>
          <textarea className="input textarea" style={{ minHeight: 80, fontFamily: 'var(--font-family-mono, monospace)' }} value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Description (optional)</label>
          <input className="input" value={desc} onChange={(e) => setDesc(e.target.value)} />
        </div>
        {err && <div className="text-sm" style={{ color: 'var(--color-danger, #ef4444)', marginBottom: 'var(--space-3)' }}>{err}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" onClick={save} disabled={saving || !key || !value}>
            {saving ? <Loader2 size={14} className="spin" /> : <Plus size={14} />} Save secret
          </button>
        </div>
      </section>

      <section className="glass-panel" style={{ padding: 'var(--space-6)' }}>
        <h2 className="heading-4" style={{ marginBottom: 'var(--space-4)' }}>Stored secrets</h2>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-4)' }}><Loader2 size={18} className="spin" /></div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-tertiary">No secrets stored.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {rows.map((s) => (
              <div key={s.id} className="glass-panel" style={{ padding: 'var(--space-3) var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: 'var(--font-family-mono, monospace)', fontWeight: 500 }}>{s.key}</div>
                  <div className="text-xs text-tertiary">
                    {s.mountAs}{s.mountPath ? ` → ${s.mountPath}` : ''}{s.description ? ` · ${s.description}` : ''}
                  </div>
                </div>
                <button className="btn btn-ghost btn-icon btn-sm" onClick={() => remove(s.key)}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
