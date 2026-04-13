'use client';
import { useState, useEffect } from 'react';
import { Bot, Plus, Loader2, X, Sparkles, Monitor, Palette, LineChart, Code2, Megaphone, Settings } from 'lucide-react';

interface AgentData { id: string; name: string; role: string; roleLabel: string; description: string | null; isActive: boolean; modelProvider: string; modelName: string; }

const roles = [
  { id: 'cto', label: 'CTO', icon: Monitor, color: 'var(--color-role-cto)', description: 'Technical architecture & engineering' },
  { id: 'cmo', label: 'CMO', icon: Megaphone, color: 'var(--color-role-cmo)', description: 'Marketing & growth strategy' },
  { id: 'pm', label: 'PM', icon: LineChart, color: 'var(--color-role-pm)', description: 'Project management & planning' },
  { id: 'developer', label: 'Developer', icon: Code2, color: 'var(--color-role-developer)', description: 'Software development' },
  { id: 'designer', label: 'Designer', icon: Palette, color: 'var(--color-role-designer)', description: 'UI/UX & visual design' },
  { id: 'custom', label: 'Custom', icon: Settings, color: 'var(--color-role-custom)', description: 'Define your own role' },
];

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [step, setStep] = useState(1);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', role: '', roleLabel: '', description: '', modelProvider: 'anthropic', modelName: 'claude-sonnet-4-20250514', systemPrompt: '', temperature: 0.7 });

  useEffect(() => { fetch('/api/agents').then((r) => r.json()).then(setAgents).finally(() => setLoading(false)); }, []);

  const handleSelectRole = (r: typeof roles[0]) => {
    setForm({ ...form, role: r.id, roleLabel: r.label, name: `${r.label} Agent`, systemPrompt: `You are the ${r.label} of the company. ${r.description}.` });
    setStep(2);
  };

  const handleCreate = async () => {
    if (!form.name.trim() || !form.systemPrompt.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/agents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      if (res.ok) { const agent = await res.json(); setAgents((prev) => [agent, ...prev]); setShowModal(false); setStep(1); setForm({ name: '', role: '', roleLabel: '', description: '', modelProvider: 'anthropic', modelName: 'claude-sonnet-4-20250514', systemPrompt: '', temperature: 0.7 }); }
    } finally { setCreating(false); }
  };

  const getRoleInfo = (role: string) => roles.find((r) => r.id === role) || roles[5];

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-16)' }}><Loader2 size={24} className="spin" style={{ color: 'var(--color-text-tertiary)' }} /></div>;

  return (
    <div style={{ padding: 'var(--space-8)', maxWidth: 1200 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-6)' }}>
        <div><h1 className="heading-2">AI Agents</h1><p className="text-secondary" style={{ marginTop: 'var(--space-1)' }}>{agents.length} agent{agents.length !== 1 ? 's' : ''} configured</p></div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}><Plus size={16} />New Agent</button>
      </div>

      {agents.length === 0 ? (
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 'var(--space-16)', gap: 'var(--space-3)', textAlign: 'center' }}>
          <Bot size={48} style={{ opacity: 0.3 }} />
          <p style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-medium)' }}>No AI agents yet</p>
          <p className="text-secondary">Add your first AI agent to start automating tasks</p>
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
                <div className="divider" />
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                  <span className="badge badge-info">{a.modelProvider}</span>
                  <span className="badge" style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-tertiary)' }}>{a.modelName}</span>
                </div>
              </div>
            );
          })}
        </div>
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
                    <button key={r.id} className="glass-card" onClick={() => handleSelectRole(r)}
                      style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-4)', cursor: 'pointer', textAlign: 'left', border: '1px solid var(--color-surface-border)', width: '100%' }}>
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
                    <div className="form-group"><label className="form-label">Provider</label><select className="input" value={form.modelProvider} onChange={(e) => setForm({ ...form, modelProvider: e.target.value })}><option value="anthropic">Anthropic</option><option value="openai">OpenAI</option></select></div>
                    <div className="form-group"><label className="form-label">Model</label><select className="input" value={form.modelName} onChange={(e) => setForm({ ...form, modelName: e.target.value })}><option value="claude-sonnet-4-20250514">Claude Sonnet</option><option value="gpt-4o">GPT-4o</option></select></div>
                  </div>
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
