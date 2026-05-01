'use client';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Bot, Plus, Loader2, X, Sparkles, Monitor, Palette, LineChart, Code2, Megaphone, Settings, FileText } from 'lucide-react';
import AgentHarnessModal from '@/components/agents/AgentHarnessModal';
import { useToast } from '@/components/Toast';

interface AgentData { id: string; name: string; role: string; roleLabel: string; description: string | null; isActive: boolean; modelProvider: string; modelName: string; systemPrompt: string; temperature: number; }

const roles = [
  { id: 'cto', label: 'CTO', icon: Monitor, color: 'var(--color-role-cto)', description: 'Technical architecture & engineering' },
  { id: 'cmo', label: 'CMO', icon: Megaphone, color: 'var(--color-role-cmo)', description: 'Marketing & growth strategy' },
  { id: 'pm', label: 'PM', icon: LineChart, color: 'var(--color-role-pm)', description: 'Project management & planning' },
  { id: 'developer', label: 'Developer', icon: Code2, color: 'var(--color-role-developer)', description: 'Software development' },
  { id: 'designer', label: 'Designer', icon: Palette, color: 'var(--color-role-designer)', description: 'UI/UX & visual design' },
  { id: 'custom', label: 'Custom', icon: Settings, color: 'var(--color-role-custom)', description: 'Define your own role' },
];

export default function ProjectAgentsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const toast = useToast();
  const [agents, setAgents] = useState<AgentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [harnessAgent, setHarnessAgent] = useState<AgentData | null>(null);
  const [step, setStep] = useState(1);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', role: '', roleLabel: '', description: '', modelProvider: 'anthropic', modelName: 'claude-sonnet-4-20250514', systemPrompt: '', temperature: 0.7 });

  useEffect(() => {
    fetch(`/api/agents?projectId=${projectId}`).then((r) => r.json()).then(setAgents).finally(() => setLoading(false));
  }, [projectId]);

  const handleSelectRole = async (r: typeof roles[0]) => {
    let systemPrompt = `You are the ${r.label} of the project. ${r.description}.`;
    try {
      const res = await fetch(`/api/agents/templates/${r.id}`);
      if (res.ok) {
        const data = await res.json();
        if (data.systemPrompt) systemPrompt = data.systemPrompt;
      }
    } catch { /* fall back to inline default */ }
    setForm({ ...form, role: r.id, roleLabel: r.label, name: `${r.label} Agent`, systemPrompt });
    setStep(2);
  };

  const MODEL_OPTIONS: Record<string, Array<{ value: string; label: string }>> = {
    anthropic: [
      { value: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
      { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
      { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
      { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
    ],
    openai: [
      { value: 'gpt-4o', label: 'GPT-4o' },
      { value: 'gpt-4o-mini', label: 'GPT-4o mini' },
      { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
    ],
    'claude-cli': [
      { value: 'claude-code', label: 'Claude Code (CLI)' },
    ],
    'codex-cli': [
      { value: 'codex', label: 'Codex (CLI)' },
    ],
  };

  const PROVIDER_OPTIONS: Array<{ value: string; label: string }> = [
    { value: 'anthropic', label: 'Anthropic' },
    { value: 'openai', label: 'OpenAI' },
    { value: 'claude-cli', label: 'Claude CLI (no API key)' },
    { value: 'codex-cli', label: 'Codex CLI (no API key)' },
  ];

  const isCliProvider = (p: string) => p === 'claude-cli' || p === 'codex-cli';

  const updateAgent = async (agentId: string, patch: Partial<AgentData>) => {
    setAgents(prev => prev.map(a => a.id === agentId ? { ...a, ...patch } as AgentData : a));
    const res = await fetch(`/api/agents/${agentId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
    if (res.ok) {
      if (patch.modelProvider || patch.modelName) toast.success('Model updated');
    } else {
      toast.error(`Update failed (${res.status})`);
    }
  };

  const handleCreate = async () => {
    if (!form.name.trim() || !form.systemPrompt.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/agents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, projectId }) });
      if (res.ok) {
        const agent = await res.json();
        setAgents((prev) => [agent, ...prev]);
        setShowModal(false); setStep(1);
        setForm({ name: '', role: '', roleLabel: '', description: '', modelProvider: 'anthropic', modelName: 'claude-sonnet-4-20250514', systemPrompt: '', temperature: 0.7 });
        toast.success(`Agent "${agent.name}" created`);
      } else {
        const body = await res.json().catch(() => ({}));
        toast.error(body?.error || `Create failed (${res.status})`);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Create failed');
    } finally { setCreating(false); }
  };

  const getRoleInfo = (role: string) => roles.find((r) => r.id === role) || roles[5];

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-16)' }}><Loader2 size={24} className="spin" style={{ color: 'var(--color-text-tertiary)' }} /></div>;

  return (
    <div style={{ padding: 'var(--space-8)', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-6)' }}>
        <div><h1 className="heading-2">AI Agents</h1><p className="text-secondary" style={{ marginTop: 'var(--space-1)' }}>{agents.length} agent{agents.length !== 1 ? 's' : ''} in this project</p></div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}><Plus size={16} />New Agent</button>
      </div>

      {agents.length === 0 ? (
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 'var(--space-16)', gap: 'var(--space-3)', textAlign: 'center' }}>
          <Bot size={48} style={{ color: 'var(--color-accent)', opacity: 0.3 }} />
          <p style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-medium)' }}>No AI agents yet</p>
          <p className="text-secondary">Add your first AI agent to this project</p>
          <button className="btn btn-primary" style={{ marginTop: 'var(--space-4)' }} onClick={() => setShowModal(true)}><Plus size={16} />Add Agent</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 'var(--space-4)' }}>
          {agents.map((a) => {
            const ri = getRoleInfo(a.role);
            return (
              <div key={a.id} className="glass-card" style={{ padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                  <div className="avatar avatar-lg" style={{ background: ri.color }}><ri.icon size={20} /></div>
                  <div style={{ flex: 1 }}><div style={{ fontWeight: 'var(--font-weight-semibold)' }}>{a.name}</div><div className="text-tertiary text-sm">{a.roleLabel}</div></div>
                  <span className={`badge ${a.isActive ? 'badge-success' : 'badge-error'}`}>{a.isActive ? 'Active' : 'Inactive'}</span>
                </div>
                {a.description && <div className="text-secondary text-sm">{a.description}</div>}
                {isCliProvider(a.modelProvider) && (
                  <div className="text-xs" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--color-accent)', background: 'var(--color-accent-muted)', padding: '2px 8px', borderRadius: 'var(--radius-full)', alignSelf: 'flex-start' }}>
                    Runs via {a.modelProvider === 'claude-cli' ? 'claude' : 'codex'} CLI · no API key
                  </div>
                )}
                <div className="divider" />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
                  <select
                    className="input"
                    style={{ padding: 'var(--space-1) var(--space-2)', fontSize: 'var(--font-size-xs)' }}
                    value={a.modelProvider}
                    onChange={(e) => {
                      const provider = e.target.value;
                      const firstModel = MODEL_OPTIONS[provider]?.[0]?.value || a.modelName;
                      updateAgent(a.id, { modelProvider: provider, modelName: firstModel });
                    }}
                  >
                    {PROVIDER_OPTIONS.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                    {!PROVIDER_OPTIONS.some((p) => p.value === a.modelProvider) && (
                      <option value={a.modelProvider}>{a.modelProvider}</option>
                    )}
                  </select>
                  <select
                    className="input"
                    style={{ padding: 'var(--space-1) var(--space-2)', fontSize: 'var(--font-size-xs)', minWidth: 0 }}
                    value={a.modelName}
                    onChange={(e) => updateAgent(a.id, { modelName: e.target.value })}
                  >
                    {(MODEL_OPTIONS[a.modelProvider] || []).map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                    {!MODEL_OPTIONS[a.modelProvider]?.some((m) => m.value === a.modelName) && (
                      <option value={a.modelName}>{a.modelName}</option>
                    )}
                  </select>
                </div>
                <button className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setHarnessAgent(a)}>
                  <FileText size={12} />Harness
                </button>
              </div>
            );
          })}
        </div>
      )}

      {harnessAgent && (
        <AgentHarnessModal
          agent={harnessAgent}
          onClose={() => setHarnessAgent(null)}
          onUpdate={(updated) => { setAgents(prev => prev.map(a => a.id === updated.id ? { ...a, ...updated } : a)); setHarnessAgent(updated as AgentData); }}
        />
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => { setShowModal(false); setStep(1); }}>
          <div className="modal-content" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-6) var(--space-6) var(--space-4)' }}>
              <h2 className="heading-3">{step === 1 ? 'Choose a Role' : 'Configure Agent'}</h2>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => { setShowModal(false); setStep(1); }}><X size={16} /></button>
            </div>
            <div style={{ padding: '0 var(--space-6) var(--space-6)' }}>
              {step === 1 ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--space-3)' }}>
                  {roles.map((r) => (
                    <button key={r.id} className="glass-card" onClick={() => handleSelectRole(r)} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-4)', cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                      <div className="avatar" style={{ background: r.color }}><r.icon size={16} /></div>
                      <div><div style={{ fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-sm)' }}>{r.label}</div><div className="text-tertiary text-xs">{r.description}</div></div>
                    </button>
                  ))}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
                  <div className="form-group"><label className="form-label">Name</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                  <div className="form-group"><label className="form-label">Description</label><input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What does this agent do?" /></div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
                    <div className="form-group"><label className="form-label">Provider</label><select className="input" value={form.modelProvider} onChange={(e) => { const p = e.target.value; setForm({ ...form, modelProvider: p, modelName: MODEL_OPTIONS[p]?.[0]?.value || form.modelName }); }}>{PROVIDER_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}</select></div>
                    <div className="form-group"><label className="form-label">Model</label><select className="input" value={form.modelName} onChange={(e) => setForm({ ...form, modelName: e.target.value })}>{(MODEL_OPTIONS[form.modelProvider] || []).map(m => <option key={m.value} value={m.value}>{m.label}</option>)}</select></div>
                  </div>
                  {isCliProvider(form.modelProvider) && (
                    <div className="text-xs text-tertiary" style={{ background: 'var(--color-accent-muted)', borderLeft: '3px solid var(--color-accent)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-sm)' }}>
                      Uses the <code>{form.modelProvider === 'claude-cli' ? 'claude' : 'codex'}</code> CLI on the host. No API key needed — auth is whatever the CLI is logged into. Make sure the binary is on the server&apos;s <code>PATH</code>.
                    </div>
                  )}
                  <div className="form-group"><label className="form-label">System Prompt</label><textarea className="input textarea" style={{ minHeight: 120 }} value={form.systemPrompt} onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })} /></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'var(--space-2)' }}>
                    <button className="btn btn-secondary" onClick={() => setStep(1)}>Back</button>
                    <button className="btn btn-primary" onClick={handleCreate} disabled={creating || !form.name.trim() || !form.systemPrompt.trim()}>
                      {creating ? <Loader2 size={16} className="spin" /> : <><Sparkles size={14} />Create Agent</>}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
