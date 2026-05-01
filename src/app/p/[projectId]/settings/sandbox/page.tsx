'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Box, Save, Loader2 } from 'lucide-react';

type Backend = 'local' | 'ssh' | 'openshell';

interface Config {
  backend: Backend;
  image: string;
  sshHost: string | null;
  sshUser: string | null;
  workspaceDir: string;
  policyYaml: string | null;
  idleTimeoutSec: number;
  maxWallSeconds: number;
  enabled: boolean;
  hasSshKey?: boolean;
}

const DEFAULT: Config = {
  backend: 'local',
  image: 'coop/sandbox-tier1:latest',
  sshHost: '',
  sshUser: '',
  workspaceDir: '/workspace',
  policyYaml: '',
  idleTimeoutSec: 900,
  maxWallSeconds: 300,
  enabled: true,
};

export default function SandboxPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cfg, setCfg] = useState<Config>(DEFAULT);
  const [sshKey, setSshKey] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/sandbox`)
      .then((r) => r.json())
      .then((j) => { if (j.config) setCfg({ ...DEFAULT, ...j.config }); })
      .finally(() => setLoading(false));
  }, [projectId]);

  async function save(e?: React.FormEvent) {
    e?.preventDefault();
    setSaving(true); setErr(null);
    try {
      const r = await fetch(`/api/projects/${projectId}/sandbox`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...cfg, sshKey: sshKey || undefined }),
      });
      if (!r.ok) { setErr((await r.json()).error || 'Save failed'); return; }
      setSshKey('');
      const j = await r.json();
      if (j.config) setCfg({ ...DEFAULT, ...j.config });
      setSavedAt(new Date());
    } finally { setSaving(false); }
  }

  if (loading) {
    return (
      <div style={{ padding: 'var(--space-8)', display: 'flex', justifyContent: 'center' }}>
        <Loader2 size={20} className="spin" />
      </div>
    );
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
          <Box size={24} style={{ color: 'var(--color-accent)' }} />
          Sandbox
        </h1>
        <p className="text-secondary" style={{ marginTop: 'var(--space-1)' }}>
          Where skill-driven shell commands execute. Local mode requires <code>SANDBOX_LOCAL_ENABLED=1</code> on the server.
        </p>
      </div>

      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
        <section className="glass-panel" style={{ padding: 'var(--space-6)' }}>
          <h2 className="heading-4" style={{ marginBottom: 'var(--space-1)' }}>Backend</h2>
          <p className="text-sm text-tertiary" style={{ marginBottom: 'var(--space-4)' }}>Which isolation target runs <code>exec_shell</code>.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <label className="popover-item" style={{ cursor: 'pointer', alignItems: 'flex-start' }}>
              <input type="radio" name="backend" checked={cfg.backend === 'local'} onChange={() => setCfg({ ...cfg, backend: 'local' })} />
              <div>
                <div style={{ fontWeight: 500 }}>Local (host <code>child_process</code>)</div>
                <div className="text-sm text-tertiary">Dev only. Runs on the machine hosting co-op. Gated by env var.</div>
              </div>
            </label>
            <label className="popover-item" style={{ cursor: 'pointer', alignItems: 'flex-start' }}>
              <input type="radio" name="backend" checked={cfg.backend === 'ssh'} onChange={() => setCfg({ ...cfg, backend: 'ssh' })} />
              <div>
                <div style={{ fontWeight: 500 }}>SSH devbox</div>
                <div className="text-sm text-tertiary">Long-lived VM you provide. Reused across runs.</div>
              </div>
            </label>
            <label className="popover-item" style={{ cursor: 'pointer', alignItems: 'flex-start', opacity: 0.6 }}>
              <input type="radio" name="backend" checked={cfg.backend === 'openshell'} onChange={() => setCfg({ ...cfg, backend: 'openshell' })} />
              <div>
                <div style={{ fontWeight: 500 }}>OpenShell <span className="text-xs text-tertiary">(stub)</span></div>
                <div className="text-sm text-tertiary">NVIDIA OpenShell gateway. Wrapper pending upstream API stabilization.</div>
              </div>
            </label>
          </div>
        </section>

        <section className="glass-panel" style={{ padding: 'var(--space-6)' }}>
          <h2 className="heading-4" style={{ marginBottom: 'var(--space-4)' }}>Runtime</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
            <div className="form-group">
              <label className="form-label">Image</label>
              <input className="input" value={cfg.image} onChange={(e) => setCfg({ ...cfg, image: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Workspace dir</label>
              <input className="input" value={cfg.workspaceDir} onChange={(e) => setCfg({ ...cfg, workspaceDir: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Idle timeout (s)</label>
              <input className="input" type="number" value={cfg.idleTimeoutSec} onChange={(e) => setCfg({ ...cfg, idleTimeoutSec: parseInt(e.target.value, 10) || 0 })} />
            </div>
            <div className="form-group">
              <label className="form-label">Max wall seconds per exec</label>
              <input className="input" type="number" value={cfg.maxWallSeconds} onChange={(e) => setCfg({ ...cfg, maxWallSeconds: parseInt(e.target.value, 10) || 0 })} />
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
            <input type="checkbox" checked={cfg.enabled} onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })} />
            <span>Sandbox enabled</span>
          </label>
        </section>

        {cfg.backend === 'ssh' && (
          <section className="glass-panel" style={{ padding: 'var(--space-6)' }}>
            <h2 className="heading-4" style={{ marginBottom: 'var(--space-1)' }}>SSH devbox</h2>
            <p className="text-sm text-tertiary" style={{ marginBottom: 'var(--space-4)' }}>Credentials for reaching your long-lived sandbox host.</p>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--space-3)' }}>
              <div className="form-group">
                <label className="form-label">Host</label>
                <input className="input" value={cfg.sshHost || ''} onChange={(e) => setCfg({ ...cfg, sshHost: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">User</label>
                <input className="input" value={cfg.sshUser || ''} onChange={(e) => setCfg({ ...cfg, sshUser: e.target.value })} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Private key {cfg.hasSshKey && <span className="text-xs text-tertiary">(stored — paste to replace)</span>}</label>
              <textarea
                className="input textarea"
                style={{ minHeight: 120, fontFamily: 'var(--font-family-mono, monospace)', fontSize: 'var(--font-size-xs)' }}
                value={sshKey}
                onChange={(e) => setSshKey(e.target.value)}
                placeholder={cfg.hasSshKey ? '(unchanged)' : '-----BEGIN OPENSSH PRIVATE KEY-----\n…'}
              />
            </div>
          </section>
        )}

        <section className="glass-panel" style={{ padding: 'var(--space-6)' }}>
          <h2 className="heading-4" style={{ marginBottom: 'var(--space-1)' }}>Policy (YAML)</h2>
          <p className="text-sm text-tertiary" style={{ marginBottom: 'var(--space-4)' }}>
            Egress allowlist modeled on OpenShell&apos;s {`{host, port, binary}`} shape. Auto-regenerated from installed skills; edit to customize.
          </p>
          <textarea
            className="input textarea"
            style={{ minHeight: 220, fontFamily: 'var(--font-family-mono, monospace)', fontSize: 'var(--font-size-xs)' }}
            value={cfg.policyYaml || ''}
            onChange={(e) => setCfg({ ...cfg, policyYaml: e.target.value })}
            placeholder={'filesystem:\n  readWrite: ["/workspace"]\nprocess:\n  allowBins: [curl, jq, gh]\nnetwork:\n  egress:\n    - host: api.github.com\n      port: 443\n      binary: curl'}
          />
        </section>

        {err && (
          <section className="glass-panel" style={{ padding: 'var(--space-4)', borderColor: 'var(--color-danger, #ef4444)' }}>
            <div className="text-sm" style={{ color: 'var(--color-danger, #ef4444)' }}>{err}</div>
          </section>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 'var(--space-3)' }}>
          {savedAt && <span className="text-xs text-tertiary">Saved {savedAt.toLocaleTimeString()}</span>}
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />} Save
          </button>
        </div>
      </form>
    </div>
  );
}
