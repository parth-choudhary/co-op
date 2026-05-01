'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, BookOpen, Loader2, Save, Lock } from 'lucide-react';

interface Doctrine {
  userMd: string | null;
  userMdUpdatedAt: string | null;
  agentsMd: string | null;
  agentsMdUpdatedAt: string | null;
  about: string | null;
  aboutUpdatedAt: string | null;
  canEdit: boolean;
}

const USER_PLACEHOLDER = `# USER.md

Who are the people this project is for? The team that runs it, the customers it serves, the stakeholders it has to please.

Write a deep model. Not a bio.
- How they think
- What they care about
- What triggers them
- What they're trying to build
- Their strengths and blind spots

The more the agents understand about the user, the better they can serve them. Aim for ~500–4000 words. Generic instructions → generic output.`;

const AGENTS_PLACEHOLDER = `# AGENTS.md

Operational rules every agent in this project must follow.

- What to check on every message
- What to never do
- How to handle failures
- Lookup chains
- Path rules
- Brain-first protocols

This is the playbook for HOW the agents work, not WHO they are. SOUL.md handles voice; AGENTS.md handles process.

If something here conflicts with an agent's role defaults, this wins.`;

export default function DoctrinePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [doctrine, setDoctrine] = useState<Doctrine | null>(null);
  const [loading, setLoading] = useState(true);
  const [userMd, setUserMd] = useState('');
  const [agentsMd, setAgentsMd] = useState('');
  const [savingUser, setSavingUser] = useState(false);
  const [savingAgents, setSavingAgents] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState<'user' | 'agents' | null>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/doctrine`);
      if (!r.ok) { setErr((await r.json()).error || 'Failed to load'); return; }
      const j: Doctrine = await r.json();
      setDoctrine(j);
      setUserMd(j.userMd || '');
      setAgentsMd(j.agentsMd || '');
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [projectId]);

  async function save(field: 'userMd' | 'agentsMd', value: string) {
    setErr(null);
    if (field === 'userMd') setSavingUser(true); else setSavingAgents(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/doctrine`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      });
      if (!r.ok) { setErr((await r.json()).error || 'Save failed'); return; }
      const updated = await r.json();
      setDoctrine((d) => d ? { ...d, ...updated } : d);
      setSavedFlash(field === 'userMd' ? 'user' : 'agents');
      setTimeout(() => setSavedFlash(null), 2000);
    } finally {
      if (field === 'userMd') setSavingUser(false); else setSavingAgents(false);
    }
  }

  const fmt = (iso: string | null) => iso ? `Updated ${new Date(iso).toLocaleString()}` : 'Never edited';

  return (
    <div style={{ padding: 'var(--space-8)', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <Link href={`/p/${projectId}/settings`} className="text-sm text-tertiary" style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)' }}>
          <ArrowLeft size={14} /> Back to settings
        </Link>
      </div>

      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h1 className="heading-2" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <BookOpen size={24} style={{ color: 'var(--color-accent)' }} />
          Project Doctrine
        </h1>
        <p className="text-secondary" style={{ marginTop: 'var(--space-1)' }}>
          USER.md and AGENTS.md are inherited by every agent in this project. Each agent's SOUL.md (its voice) is set per-agent on the agent harness page.
        </p>
        {doctrine && !doctrine.canEdit && (
          <div className="glass-panel" style={{ padding: 'var(--space-3) var(--space-4)', marginTop: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', background: 'var(--color-bg-tertiary)' }}>
            <Lock size={14} style={{ color: 'var(--color-text-tertiary)' }} />
            <span className="text-sm text-tertiary">Read-only — only project owners and admins can edit doctrine.</span>
          </div>
        )}
      </div>

      {err && (
        <div className="glass-panel" style={{ padding: 'var(--space-3) var(--space-4)', marginBottom: 'var(--space-4)', borderColor: 'var(--color-error)' }}>
          <span className="text-sm" style={{ color: 'var(--color-error)' }}>{err}</span>
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-8)' }}>
          <Loader2 size={20} className="spin" style={{ color: 'var(--color-text-tertiary)' }} />
        </div>
      ) : doctrine && (
        <>
          <section className="glass-panel" style={{ padding: 'var(--space-6)', marginBottom: 'var(--space-5)' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
              <h2 className="heading-4">USER.md</h2>
              <span className="text-xs text-tertiary">{fmt(doctrine.userMdUpdatedAt)}</span>
            </div>
            <p className="text-sm text-tertiary" style={{ marginBottom: 'var(--space-3)' }}>
              Who the agents are serving. The deeper the model, the more tailored their output.
            </p>
            <textarea
              className="input textarea"
              style={{ minHeight: 280, fontFamily: 'var(--font-family-mono, monospace)', fontSize: 'var(--font-size-sm)' }}
              value={userMd}
              onChange={(e) => setUserMd(e.target.value)}
              placeholder={USER_PLACEHOLDER}
              disabled={!doctrine.canEdit}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
              {savedFlash === 'user' && <span className="text-xs" style={{ color: 'var(--color-success)' }}>Saved</span>}
              <button
                className="btn btn-primary btn-sm"
                onClick={() => save('userMd', userMd)}
                disabled={!doctrine.canEdit || savingUser || userMd === (doctrine.userMd || '')}
              >
                {savingUser ? <Loader2 size={12} className="spin" /> : <Save size={12} />} Save USER.md
              </button>
            </div>
          </section>

          <section className="glass-panel" style={{ padding: 'var(--space-6)' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
              <h2 className="heading-4">AGENTS.md</h2>
              <span className="text-xs text-tertiary">{fmt(doctrine.agentsMdUpdatedAt)}</span>
            </div>
            <p className="text-sm text-tertiary" style={{ marginBottom: 'var(--space-3)' }}>
              House rules every agent must follow. Overrides role defaults when they conflict.
            </p>
            <textarea
              className="input textarea"
              style={{ minHeight: 280, fontFamily: 'var(--font-family-mono, monospace)', fontSize: 'var(--font-size-sm)' }}
              value={agentsMd}
              onChange={(e) => setAgentsMd(e.target.value)}
              placeholder={AGENTS_PLACEHOLDER}
              disabled={!doctrine.canEdit}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
              {savedFlash === 'agents' && <span className="text-xs" style={{ color: 'var(--color-success)' }}>Saved</span>}
              <button
                className="btn btn-primary btn-sm"
                onClick={() => save('agentsMd', agentsMd)}
                disabled={!doctrine.canEdit || savingAgents || agentsMd === (doctrine.agentsMd || '')}
              >
                {savingAgents ? <Loader2 size={12} className="spin" /> : <Save size={12} />} Save AGENTS.md
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
