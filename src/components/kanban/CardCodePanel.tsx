'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Code2, Loader2, GitPullRequest, GitBranch, ExternalLink, Play, X } from 'lucide-react';

interface RunRow {
  id: string;
  status: string;
  triggerKind: string;
  executionMode: string;
  branchName: string | null;
  prNumber: number | null;
  prUrl: string | null;
  commitSha: string | null;
  logsUrl: string | null;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
}

interface Props {
  cardId: string;
  projectId: string;
  hasAgentAssigned: boolean;
}

const STATUS_LABELS: Record<string, string> = {
  queued: 'Queued',
  dispatched: 'Dispatched',
  running: 'Running',
  pr_opened: 'PR opened',
  checks_running: 'Checks running',
  checks_passed: 'Checks passed',
  checks_failed: 'Checks failed',
  merged: 'Merged',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

function statusColor(status: string): string {
  if (['merged', 'completed', 'checks_passed'].includes(status)) return 'var(--color-accent)';
  if (['failed', 'checks_failed', 'cancelled'].includes(status)) return 'var(--color-error)';
  return 'var(--color-text-secondary)';
}

export default function CardCodePanel({ cardId, projectId, hasAgentAssigned }: Props) {
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [manualAllowed, setManualAllowed] = useState(false);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const [cfg, runsRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/code-config`).then((r) => r.ok ? r.json() : null),
        fetch(`/api/cards/${cardId}/runs`).then((r) => r.ok ? r.json() : { runs: [] }),
      ]);
      setConfigured(!!cfg);
      setManualAllowed(!!cfg?.triggerOnManual);
      setRuns(runsRes.runs || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [cardId, projectId]);

  const activeRun = runs.find((r) => !['completed', 'failed', 'merged', 'cancelled'].includes(r.status));

  const handleRun = async () => {
    setError(null);
    setRunning(true);
    try {
      const res = await fetch(`/api/cards/${cardId}/run-agent`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || 'Failed to start run');
      } else {
        await refresh();
      }
    } finally {
      setRunning(false);
    }
  };

  const handleCancel = async (runId: string) => {
    await fetch(`/api/runs/${runId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'cancelled' }),
    });
    await refresh();
  };

  if (loading) {
    return (
      <div style={{ padding: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', color: 'var(--color-text-tertiary)' }}>
        <Loader2 size={14} className="spin" /> <span className="text-sm">Loading code status…</span>
      </div>
    );
  }

  return (
    <div className="glass-panel" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
        <Code2 size={16} style={{ color: 'var(--color-accent)' }} />
        <h4 className="heading-5" style={{ margin: 0 }}>Code</h4>
      </div>

      {!configured ? (
        <div className="text-sm text-tertiary">
          Code automation isn&apos;t set up for this project.{' '}
          <Link href={`/p/${projectId}/settings/code`} style={{ color: 'var(--color-accent)' }}>Configure it</Link> to let assigned agents open PRs from this card.
        </div>
      ) : (
        <>
          {activeRun ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="badge" style={{ background: 'var(--color-bg-tertiary)', color: statusColor(activeRun.status) }}>
                  {STATUS_LABELS[activeRun.status] || activeRun.status}
                </span>
                <button className="btn btn-ghost btn-sm" onClick={() => handleCancel(activeRun.id)} title="Cancel run">
                  <X size={12} /> Cancel
                </button>
              </div>
              {activeRun.branchName && (
                <div className="text-xs text-tertiary" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <GitBranch size={12} /> {activeRun.branchName}
                </div>
              )}
              {activeRun.prUrl && (
                <a href={activeRun.prUrl} target="_blank" rel="noopener noreferrer" className="text-xs" style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--color-accent)' }}>
                  <GitPullRequest size={12} /> PR #{activeRun.prNumber} <ExternalLink size={10} />
                </a>
              )}
              {activeRun.logsUrl && (
                <a href={activeRun.logsUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-tertiary" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  View logs <ExternalLink size={10} />
                </a>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <button
                className="btn btn-primary btn-sm"
                onClick={handleRun}
                disabled={running || !manualAllowed || !hasAgentAssigned}
                title={!hasAgentAssigned ? 'Assign an agent to this card first' : !manualAllowed ? 'Manual runs are disabled in project settings' : ''}
              >
                {running ? <Loader2 size={12} className="spin" /> : <Play size={12} />} Run agent
              </button>
              {!hasAgentAssigned && <div className="text-xs text-tertiary">Assign an agent before running.</div>}
              {!manualAllowed && <div className="text-xs text-tertiary">Manual runs are disabled in project settings.</div>}
            </div>
          )}
          {error && <div className="text-xs" style={{ color: 'var(--color-error)', marginTop: 'var(--space-2)' }}>{error}</div>}

          {runs.length > 0 && (
            <div style={{ marginTop: 'var(--space-3)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--color-surface-border)' }}>
              <div className="text-xs text-tertiary" style={{ marginBottom: 'var(--space-2)' }}>Recent runs</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                {runs.slice(0, 5).map((r) => (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 'var(--font-size-xs)' }}>
                    <span style={{ color: statusColor(r.status) }}>{STATUS_LABELS[r.status] || r.status}</span>
                    <span className="text-tertiary">{new Date(r.startedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                    {r.prUrl ? (
                      <a href={r.prUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-accent)' }}>PR #{r.prNumber}</a>
                    ) : <span className="text-tertiary">—</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
