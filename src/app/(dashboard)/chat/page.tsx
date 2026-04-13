'use client';
import { MessageSquare, Sparkles } from 'lucide-react';

export default function ChatPage() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: 'var(--space-8)' }}>
      <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 'var(--space-16)', textAlign: 'center', maxWidth: 500 }}>
        <div style={{ width: 80, height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-accent-gradient)', borderRadius: 'var(--radius-2xl)', color: 'white', marginBottom: 'var(--space-6)', boxShadow: 'var(--shadow-glow-lg)' }}>
          <MessageSquare size={48} />
        </div>
        <h2 className="heading-2">Chat is coming soon</h2>
        <p className="text-secondary" style={{ maxWidth: 400, textAlign: 'center', marginTop: 'var(--space-2)' }}>Slack-like messaging powered by Matrix. Coordinate with your team and AI agents in real-time.</p>
        <div style={{ display: 'flex', gap: 'var(--space-4)', marginTop: 'var(--space-6)', flexWrap: 'wrap', justifyContent: 'center' }}>
          {['Project channels', 'AI agent messaging', 'Threads & reactions'].map((f) => (
            <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', padding: 'var(--space-2) var(--space-3)', background: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-full)' }}>
              <Sparkles size={16} /><span>{f}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
