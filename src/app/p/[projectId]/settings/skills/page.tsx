'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Sparkles, Plus, Trash2, Power, Loader2, Search, Download, Star, ExternalLink } from 'lucide-react';
import { useToast } from '@/components/Toast';

interface Installed {
  id: string;
  slug: string;
  version: string;
  source: string;
  enabled: boolean;
  description: string;
  requires: any;
}
interface Available { slug: string; version: string; description: string; }
interface ClawhubHit { slug: string; displayName?: string; version: string; description?: string; downloads?: number; stars?: number; updatedAt?: string; }

export default function SkillsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [installed, setInstalled] = useState<Installed[]>([]);
  const [available, setAvailable] = useState<Available[]>([]);
  const [importSlug, setImportSlug] = useState('');
  const [importRaw, setImportRaw] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [clawQuery, setClawQuery] = useState('');
  const [clawResults, setClawResults] = useState<ClawhubHit[] | null>(null);
  const [clawLoading, setClawLoading] = useState(false);
  const [clawErr, setClawErr] = useState<string | null>(null);
  const [installingSlug, setInstallingSlug] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/skills`);
      if (!r.ok) throw new Error(await r.text());
      const j = await r.json();
      setInstalled(j.installed || []);
      setAvailable(j.available || []);
      setErr(null);
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); browseTrending(); }, [projectId]);

  async function browseTrending() {
    setClawLoading(true); setClawErr(null);
    try {
      const r = await fetch('/api/clawhub/search?sort=trending&limit=30');
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'search failed');
      setClawResults(j.results || []);
    } catch (e: any) { setClawErr(e.message); setClawResults([]); }
    finally { setClawLoading(false); }
  }

  async function runSearch(q: string) {
    setClawLoading(true); setClawErr(null);
    try {
      const url = q.trim() ? `/api/clawhub/search?q=${encodeURIComponent(q.trim())}&limit=30` : '/api/clawhub/search?sort=trending&limit=30';
      const r = await fetch(url);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'search failed');
      setClawResults(j.results || []);
    } catch (e: any) { setClawErr(e.message); setClawResults([]); }
    finally { setClawLoading(false); }
  }

  async function installFromClawhub(slug: string) {
    setInstallingSlug(slug); setErr(null);
    try {
      const r = await fetch(`/api/projects/${projectId}/skills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'clawhub', slug }),
      });
      if (!r.ok) {
        const msg = (await r.json()).error || 'install failed';
        setErr(msg);
        toast.error(`Install failed: ${msg}`);
        return;
      }
      load();
      toast.success(`Installed "${slug}"`);
    } finally { setInstallingSlug(null); }
  }

  async function installBundled(slug: string) {
    const r = await fetch(`/api/projects/${projectId}/skills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'bundled', slug }),
    });
    if (r.ok) toast.success(`Installed "${slug}"`);
    else toast.error(`Install failed (${r.status})`);
    load();
  }
  async function installFromMd() {
    if (!importSlug || !importRaw) return;
    const r = await fetch(`/api/projects/${projectId}/skills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'markdown', slug: importSlug, raw: importRaw }),
    });
    if (r.ok) {
      const slug = importSlug;
      setImportSlug(''); setImportRaw('');
      load();
      toast.success(`Installed "${slug}"`);
    } else {
      const msg = await r.text();
      setErr(msg);
      toast.error(`Install failed: ${msg.slice(0, 120)}`);
    }
  }
  async function toggle(slug: string, enabled: boolean) {
    const r = await fetch(`/api/projects/${projectId}/skills`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, enabled }),
    });
    if (r.ok) toast.success(`${slug} ${enabled ? 'enabled' : 'disabled'}`);
    else toast.error(`Update failed (${r.status})`);
    load();
  }
  async function remove(slug: string) {
    const r = await fetch(`/api/projects/${projectId}/skills?slug=${encodeURIComponent(slug)}`, { method: 'DELETE' });
    if (r.ok) toast.success(`Removed "${slug}"`);
    else toast.error(`Delete failed (${r.status})`);
    load();
  }

  const installedSlugs = new Set(installed.map((i) => i.slug));

  return (
    <div style={{ padding: 'var(--space-8)', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <Link href={`/p/${projectId}/settings`} className="text-sm text-tertiary" style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)' }}>
          <ArrowLeft size={14} /> Back to settings
        </Link>
      </div>
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h1 className="heading-2" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <Sparkles size={24} style={{ color: 'var(--color-accent)' }} />
          Skills
        </h1>
        <p className="text-secondary" style={{ marginTop: 'var(--space-1)' }}>
          ClawHub / OpenClaw-format skills. Each skill declares required env vars and CLI binaries; invocations run inside the project sandbox.
        </p>
      </div>

      {err && (
        <section className="glass-panel" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-4)', borderColor: 'var(--color-danger, #ef4444)' }}>
          <div className="text-sm" style={{ color: 'var(--color-danger, #ef4444)' }}>{err}</div>
        </section>
      )}

      <section className="glass-panel" style={{ padding: 'var(--space-6)', marginBottom: 'var(--space-5)' }}>
        <h2 className="heading-4" style={{ marginBottom: 'var(--space-1)' }}>Installed</h2>
        <p className="text-sm text-tertiary" style={{ marginBottom: 'var(--space-4)' }}>Skills enabled on this project.</p>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-6)' }}><Loader2 size={18} className="spin" /></div>
        ) : installed.length === 0 ? (
          <div className="text-sm text-tertiary">No skills installed yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {installed.map((s) => (
              <div key={s.id} className="glass-panel" style={{ padding: 'var(--space-3) var(--space-4)', display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <span style={{ fontFamily: 'var(--font-family-mono, monospace)', fontWeight: 500 }}>{s.slug}</span>
                    <span className="text-xs text-tertiary">v{s.version}</span>
                    <span className="badge">{s.source}</span>
                    {!s.enabled && <span className="badge badge-warn">disabled</span>}
                  </div>
                  {s.description && <div className="text-sm text-secondary" style={{ marginTop: 'var(--space-1)' }}>{s.description}</div>}
                  {(s.requires?.env?.length || s.requires?.bins?.length) ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 'var(--space-2)' }}>
                      {(s.requires.env || []).map((e: string) => (
                        <span key={e} className="badge" style={{ fontFamily: 'var(--font-family-mono, monospace)' }}>env: {e}</span>
                      ))}
                      {(s.requires.bins || []).map((b: string) => (
                        <span key={b} className="badge" style={{ fontFamily: 'var(--font-family-mono, monospace)' }}>bin: {b}</span>
                      ))}
                    </div>
                  ) : null}
                </div>
                <button className="btn btn-ghost btn-icon btn-sm" onClick={() => toggle(s.slug, !s.enabled)} title={s.enabled ? 'Disable' : 'Enable'}>
                  <Power size={14} />
                </button>
                <button className="btn btn-ghost btn-icon btn-sm" onClick={() => remove(s.slug)} title="Uninstall">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="glass-panel" style={{ padding: 'var(--space-6)', marginBottom: 'var(--space-5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-1)' }}>
          <h2 className="heading-4">Browse ClawHub</h2>
          <a href="https://clawhub.ai" target="_blank" rel="noreferrer" className="text-xs text-tertiary" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            clawhub.ai <ExternalLink size={10} />
          </a>
        </div>
        <p className="text-sm text-tertiary" style={{ marginBottom: 'var(--space-4)' }}>
          Search the public registry and install any skill directly. We fetch its <code>SKILL.md</code> and register it on this project.
        </p>
        <form
          onSubmit={(e) => { e.preventDefault(); runSearch(clawQuery); }}
          style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}
        >
          <div style={{ flex: 1, position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)' }} />
            <input
              className="input"
              style={{ paddingLeft: 32 }}
              placeholder="Search skills (e.g. slack, twitter, moderator, todoist)"
              value={clawQuery}
              onChange={(e) => setClawQuery(e.target.value)}
            />
          </div>
          <button className="btn btn-secondary" type="submit" disabled={clawLoading}>
            {clawLoading ? <Loader2 size={14} className="spin" /> : <Search size={14} />} Search
          </button>
          {clawQuery && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setClawQuery(''); browseTrending(); }}>
              Trending
            </button>
          )}
        </form>
        {clawErr && <div className="text-sm" style={{ color: 'var(--color-danger, #ef4444)', marginBottom: 'var(--space-3)' }}>{clawErr}</div>}
        {clawLoading && clawResults === null ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-6)' }}><Loader2 size={18} className="spin" /></div>
        ) : (clawResults && clawResults.length === 0) ? (
          <div className="text-sm text-tertiary">No results.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', maxHeight: 480, overflow: 'auto' }}>
            {(clawResults || []).map((r) => {
              const inst = installedSlugs.has(r.slug);
              const busy = installingSlug === r.slug;
              return (
                <div key={r.slug} className="glass-panel" style={{ padding: 'var(--space-3) var(--space-4)', display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                      <a
                        href={`https://clawhub.ai/skills/${encodeURIComponent(r.slug)}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ fontFamily: 'var(--font-family-mono, monospace)', fontWeight: 500, color: 'var(--color-text-primary, inherit)' }}
                      >
                        {r.slug}
                      </a>
                      <span className="text-xs text-tertiary">v{r.version}</span>
                      {typeof r.stars === 'number' && r.stars > 0 && (
                        <span className="text-xs text-tertiary" style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                          <Star size={10} /> {r.stars}
                        </span>
                      )}
                      {typeof r.downloads === 'number' && r.downloads > 0 && (
                        <span className="text-xs text-tertiary" style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                          <Download size={10} /> {r.downloads}
                        </span>
                      )}
                    </div>
                    {r.description && (
                      <div className="text-sm text-secondary" style={{ marginTop: 'var(--space-1)', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                        {r.description}
                      </div>
                    )}
                  </div>
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={inst || busy}
                    onClick={() => installFromClawhub(r.slug)}
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    {busy ? <Loader2 size={12} className="spin" /> : <Plus size={12} />}
                    {inst ? 'Installed' : busy ? 'Installing…' : 'Install'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="glass-panel" style={{ padding: 'var(--space-6)', marginBottom: 'var(--space-5)' }}>
        <h2 className="heading-4" style={{ marginBottom: 'var(--space-1)' }}>Bundled skills</h2>
        <p className="text-sm text-tertiary" style={{ marginBottom: 'var(--space-4)' }}>Ship with co-op. One click to install.</p>
        {available.length === 0 ? (
          <div className="text-sm text-tertiary">No bundled skills detected in <code>skills/</code>.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {available.map((a) => {
              const inst = installedSlugs.has(a.slug);
              return (
                <div key={a.slug} className="glass-panel" style={{ padding: 'var(--space-3) var(--space-4)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: 'var(--font-family-mono, monospace)', fontWeight: 500 }}>
                      {a.slug} <span className="text-xs text-tertiary">v{a.version}</span>
                    </div>
                    <div className="text-sm text-tertiary">{a.description}</div>
                  </div>
                  <button className="btn btn-primary btn-sm" disabled={inst} onClick={() => installBundled(a.slug)}>
                    <Plus size={12} /> {inst ? 'Installed' : 'Install'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="glass-panel" style={{ padding: 'var(--space-6)' }}>
        <button
          type="button"
          onClick={() => setShowManual((v) => !v)}
          className="btn btn-ghost btn-sm"
          style={{ marginBottom: showManual ? 'var(--space-3)' : 0 }}
        >
          {showManual ? '▾' : '▸'} Advanced: paste a SKILL.md directly
        </button>
        {showManual && (
          <>
            <p className="text-sm text-tertiary" style={{ marginBottom: 'var(--space-4)' }}>For unreleased skills, local drafts, or anything not on ClawHub.</p>
            <div className="form-group">
              <label className="form-label">Slug</label>
              <input className="input" placeholder="my-skill" value={importSlug} onChange={(e) => setImportSlug(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">SKILL.md contents</label>
              <textarea
                className="input textarea"
                style={{ minHeight: 220, fontFamily: 'var(--font-family-mono, monospace)', fontSize: 'var(--font-size-xs)' }}
                placeholder={'---\nname: my-skill\n---\nBody…'}
                value={importRaw}
                onChange={(e) => setImportRaw(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" onClick={installFromMd} disabled={!importSlug || !importRaw}>
                <Plus size={14} /> Install skill
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
