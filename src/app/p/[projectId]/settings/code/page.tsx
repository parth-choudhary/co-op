'use client';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Code2, Loader2, Save, Trash2, Info } from 'lucide-react';

type ExecutionMode = 'github_actions' | 'ssh_devbox' | 'local_git';
type MergePolicy = 'human_pr' | 'staging_branch' | 'auto_merge';

interface Config {
  executionMode: ExecutionMode;
  mergePolicy: MergePolicy;
  repoFullName: string | null;
  defaultBranch: string;
  stagingBranch: string | null;
  ghInstallationId: string | null;
  triggerColumnIds: string[];
  triggerOnAssign: boolean;
  triggerOnComment: boolean;
  triggerOnColumnMove: boolean;
  triggerOnManual: boolean;
  sshHost: string | null;
  sshUser: string | null;
  hasSshKey?: boolean;
  localRepoPath: string | null;
  pushToRemote: boolean;
  openPrWithGhCli: boolean;
  maxTokensPerRun: number;
  maxWallSecondsPerRun: number;
}

interface ColumnOpt { id: string; name: string; boardName: string; }

const DEFAULT: Config = {
  executionMode: 'github_actions',
  mergePolicy: 'human_pr',
  repoFullName: '',
  defaultBranch: 'main',
  stagingBranch: '',
  ghInstallationId: '',
  triggerColumnIds: [],
  triggerOnAssign: false,
  triggerOnComment: true,
  triggerOnColumnMove: true,
  triggerOnManual: true,
  sshHost: '',
  sshUser: '',
  localRepoPath: '',
  pushToRemote: false,
  openPrWithGhCli: false,
  maxTokensPerRun: 200000,
  maxWallSecondsPerRun: 1800,
};

export default function CodeSettingsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<Config>(DEFAULT);
  const [columns, setColumns] = useState<ColumnOpt[]>([]);
  const [sshKey, setSshKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [localModeEnabled, setLocalModeEnabled] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`/api/projects/${projectId}/code-config`).then((r) => r.ok ? r.json() : null),
      fetch(`/api/projects/${projectId}/boards`).then((r) => r.ok ? r.json() : []),
    ]).then(([cfg, boards]) => {
      if (cfg) {
        setConfig({ ...DEFAULT, ...cfg });
        if (cfg._localModeEnabled) setLocalModeEnabled(true);
      }
      const cols: ColumnOpt[] = [];
      for (const b of boards || []) {
        for (const c of b.columns || []) cols.push({ id: c.id, name: c.name, boardName: b.name });
      }
      setColumns(cols);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [projectId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body: any = { ...config };
      if (sshKey.trim()) body.sshKey = sshKey.trim();
      const res = await fetch(`/api/projects/${projectId}/code-config`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const saved = await res.json();
        setConfig({ ...DEFAULT, ...saved });
        setSshKey('');
        setSavedAt(new Date());
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.error || 'Failed to save');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDisable = async () => {
    if (!confirm('Disable code automation for this project? Any in-flight runs will not be cancelled.')) return;
    await fetch(`/api/projects/${projectId}/code-config`, { method: 'DELETE' });
    setConfig(DEFAULT);
    setSavedAt(null);
  };

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
          <Code2 size={24} style={{ color: 'var(--color-accent)' }} />
          Code Automation
        </h1>
        <p className="text-secondary" style={{ marginTop: 'var(--space-1)' }}>
          Let agents assigned to kanban cards open pull requests against your repo.
        </p>
      </div>

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
        {/* Execution mode */}
        <section className="glass-panel" style={{ padding: 'var(--space-6)' }}>
          <h2 className="heading-4" style={{ marginBottom: 'var(--space-1)' }}>Execution environment</h2>
          <p className="text-sm text-tertiary" style={{ marginBottom: 'var(--space-4)' }}>
            Where should the coding loop actually run? Neither option runs code inside this app.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <label className="popover-item" style={{ cursor: 'pointer', alignItems: 'flex-start' }}>
              <input type="radio" name="mode" checked={config.executionMode === 'github_actions'} onChange={() => setConfig({ ...config, executionMode: 'github_actions' })} />
              <div>
                <div style={{ fontWeight: 500 }}>GitHub Actions</div>
                <div className="text-sm text-tertiary">We trigger a workflow in your repo. The GitHub-hosted runner clones, runs the agent, pushes a branch, and opens a PR. Simplest to set up.</div>
              </div>
            </label>
            <label className="popover-item" style={{ cursor: 'pointer', alignItems: 'flex-start' }}>
              <input type="radio" name="mode" checked={config.executionMode === 'ssh_devbox'} onChange={() => setConfig({ ...config, executionMode: 'ssh_devbox' })} />
              <div>
                <div style={{ fontWeight: 500 }}>Self-hosted dev box (SSH)</div>
                <div className="text-sm text-tertiary">A long-lived VM you provide runs a small co-op worker. Better for private networks, stateful tooling, or if you don't want to add a workflow to your repo.</div>
              </div>
            </label>
            <label className="popover-item" style={{ cursor: 'pointer', alignItems: 'flex-start', opacity: localModeEnabled ? 1 : 0.5 }}>
              <input type="radio" name="mode" disabled={!localModeEnabled} checked={config.executionMode === 'local_git'} onChange={() => setConfig({ ...config, executionMode: 'local_git' })} />
              <div>
                <div style={{ fontWeight: 500 }}>Local checkout {!localModeEnabled && <span className="text-xs text-tertiary">(disabled on this deployment)</span>}</div>
                <div className="text-sm text-tertiary">Point the agent at a repo on the same machine running co-op. A worktree is created per run, so your main working copy is untouched. Pushes and PRs are optional.</div>
              </div>
            </label>
          </div>
          {!localModeEnabled && (
            <p className="text-xs text-tertiary" style={{ marginTop: 'var(--space-3)' }}>
              Local mode is only available when co-op is running on your own machine. Set <code>COOP_LOCAL_MODE=1</code> to enable it.
            </p>
          )}
        </section>

        {/* Local-git config */}
        {config.executionMode === 'local_git' && (
          <section className="glass-panel" style={{ padding: 'var(--space-6)' }}>
            <h2 className="heading-4" style={{ marginBottom: 'var(--space-1)' }}>Local repository</h2>
            <p className="text-sm text-tertiary" style={{ marginBottom: 'var(--space-4)' }}>
              Absolute path to a git working tree on this machine. Each run creates an isolated worktree so the agent never touches your current checkout.
            </p>
            <div className="form-group">
              <label className="form-label">Repo path</label>
              <input className="input" placeholder="/Users/you/src/my-project" value={config.localRepoPath || ''} onChange={(e) => setConfig({ ...config, localRepoPath: e.target.value })} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <input type="checkbox" checked={config.pushToRemote} onChange={(e) => setConfig({ ...config, pushToRemote: e.target.checked })} />
                <span>Push the branch to <code>origin</code> when the agent finishes</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', opacity: config.pushToRemote ? 1 : 0.5 }}>
                <input type="checkbox" disabled={!config.pushToRemote} checked={config.openPrWithGhCli} onChange={(e) => setConfig({ ...config, openPrWithGhCli: e.target.checked })} />
                <span>Also open a pull request via <code>gh pr create</code> (requires <code>gh auth</code> on this machine)</span>
              </label>
            </div>
          </section>
        )}

        {/* Repository */}
        <section className="glass-panel" style={{ padding: 'var(--space-6)' }}>
          <h2 className="heading-4" style={{ marginBottom: 'var(--space-1)' }}>Repository</h2>
          <p className="text-sm text-tertiary" style={{ marginBottom: 'var(--space-4)' }}>
            GitHub App + PR-only. Install the co-op GitHub App on your repo, then paste the identifiers below.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
            <div className="form-group">
              <label className="form-label">Repo (owner/name)</label>
              <input className="input" placeholder="acme/web" value={config.repoFullName || ''} onChange={(e) => setConfig({ ...config, repoFullName: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Default branch</label>
              <input className="input" placeholder="main" value={config.defaultBranch} onChange={(e) => setConfig({ ...config, defaultBranch: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">GitHub App installation ID</label>
              <input className="input" placeholder="12345678" value={config.ghInstallationId || ''} onChange={(e) => setConfig({ ...config, ghInstallationId: e.target.value })} />
              <div className="text-xs text-tertiary" style={{ marginTop: 4 }}>Shown in the GitHub App install URL: /settings/installations/<strong>&lt;id&gt;</strong></div>
            </div>
            <div className="form-group">
              <label className="form-label">Staging branch</label>
              <input className="input" placeholder="staging" value={config.stagingBranch || ''} onChange={(e) => setConfig({ ...config, stagingBranch: e.target.value })} disabled={config.mergePolicy !== 'staging_branch'} />
            </div>
          </div>
        </section>

        {/* SSH (conditional) */}
        {config.executionMode === 'ssh_devbox' && (
          <section className="glass-panel" style={{ padding: 'var(--space-6)' }}>
            <h2 className="heading-4" style={{ marginBottom: 'var(--space-4)' }}>SSH dev box</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
              <div className="form-group">
                <label className="form-label">Host</label>
                <input className="input" placeholder="runner.example.com" value={config.sshHost || ''} onChange={(e) => setConfig({ ...config, sshHost: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">User</label>
                <input className="input" placeholder="coop" value={config.sshUser || ''} onChange={(e) => setConfig({ ...config, sshUser: e.target.value })} />
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">SSH private key {config.hasSshKey && <span className="text-xs text-tertiary">(already saved — leave blank to keep)</span>}</label>
                <textarea className="input textarea" rows={4} placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" value={sshKey} onChange={(e) => setSshKey(e.target.value)} />
              </div>
            </div>
          </section>
        )}

        {/* Merge policy */}
        <section className="glass-panel" style={{ padding: 'var(--space-6)' }}>
          <h2 className="heading-4" style={{ marginBottom: 'var(--space-4)' }}>Merge policy</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {([
              ['human_pr', 'Human reviews and merges', 'Agent opens a PR and stops. You review, then merge. Safest default.'],
              ['staging_branch', 'Auto-merge to staging branch', 'Agent\'s PR auto-merges into a non-prod branch once CI passes. Production merges still human.'],
              ['auto_merge', 'Fully autonomous: merge to default branch', 'Agent\'s PR auto-merges once required checks pass. Requires real CI + rollback; highest risk.'],
            ] as const).map(([val, label, desc]) => (
              <label key={val} className="popover-item" style={{ cursor: 'pointer', alignItems: 'flex-start' }}>
                <input type="radio" name="policy" checked={config.mergePolicy === val} onChange={() => setConfig({ ...config, mergePolicy: val })} />
                <div>
                  <div style={{ fontWeight: 500 }}>{label}</div>
                  <div className="text-sm text-tertiary">{desc}</div>
                </div>
              </label>
            ))}
          </div>
        </section>

        {/* Triggers */}
        <section className="glass-panel" style={{ padding: 'var(--space-6)' }}>
          <h2 className="heading-4" style={{ marginBottom: 'var(--space-1)' }}>Triggers</h2>
          <p className="text-sm text-tertiary" style={{ marginBottom: 'var(--space-4)' }}>When should an agent kick off?</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <input type="checkbox" checked={config.triggerOnColumnMove} onChange={(e) => setConfig({ ...config, triggerOnColumnMove: e.target.checked })} />
              Card moved into any selected column
            </label>
            {config.triggerOnColumnMove && (
              <div style={{ marginLeft: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                <div className="text-xs text-tertiary">Pick one or more trigger columns across any board.</div>
                {(() => {
                  const byBoard: Record<string, ColumnOpt[]> = {};
                  for (const c of columns) (byBoard[c.boardName] ||= []).push(c);
                  const boardNames = Object.keys(byBoard);
                  if (boardNames.length === 0) return <div className="text-xs text-tertiary">No boards found.</div>;
                  return boardNames.map((board) => (
                    <div key={board}>
                      <div className="text-xs" style={{ fontWeight: 'var(--font-weight-semibold)', marginBottom: 'var(--space-1)' }}>{board}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                        {byBoard[board].map((c) => {
                          const on = config.triggerColumnIds.includes(c.id);
                          return (
                            <label key={c.id} className="popover-item" style={{ cursor: 'pointer', padding: '4px 10px' }}>
                              <input
                                type="checkbox"
                                checked={on}
                                onChange={() => setConfig({
                                  ...config,
                                  triggerColumnIds: on
                                    ? config.triggerColumnIds.filter((x) => x !== c.id)
                                    : [...config.triggerColumnIds, c.id],
                                })}
                              />
                              <span className="text-sm">{c.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ));
                })()}
              </div>
            )}
            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <input type="checkbox" checked={config.triggerOnAssign} onChange={(e) => setConfig({ ...config, triggerOnAssign: e.target.checked })} />
              Card assigned to an agent
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <input type="checkbox" checked={config.triggerOnComment} onChange={(e) => setConfig({ ...config, triggerOnComment: e.target.checked })} />
              <span>@mention with start intent (<code>@agent start</code>, <code>@agent go</code>)</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <input type="checkbox" checked={config.triggerOnManual} onChange={(e) => setConfig({ ...config, triggerOnManual: e.target.checked })} />
              Manual &quot;Run&quot; button on the card
            </label>
          </div>
        </section>

        {/* Budgets */}
        <section className="glass-panel" style={{ padding: 'var(--space-6)' }}>
          <h2 className="heading-4" style={{ marginBottom: 'var(--space-4)' }}>Budgets</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
            <div className="form-group">
              <label className="form-label">Max tokens per run</label>
              <input type="number" className="input" value={config.maxTokensPerRun} onChange={(e) => setConfig({ ...config, maxTokensPerRun: Number(e.target.value) || 0 })} />
            </div>
            <div className="form-group">
              <label className="form-label">Max wall seconds per run</label>
              <input type="number" className="input" value={config.maxWallSecondsPerRun} onChange={(e) => setConfig({ ...config, maxWallSecondsPerRun: Number(e.target.value) || 0 })} />
            </div>
          </div>
        </section>

        {error && (
          <div className="glass-panel" style={{ padding: 'var(--space-3)', color: 'var(--color-error)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <Info size={16} /> {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={handleDisable} style={{ color: 'var(--color-error)' }}>
            <Trash2 size={14} /> Disable code automation
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            {savedAt && <span className="text-xs text-tertiary">Saved {savedAt.toLocaleTimeString()}</span>}
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />} Save
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
