'use client';
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Gamepad2, Mail, Lock, ArrowRight, Loader2 } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await signIn('credentials', { email, password, redirect: false });
      if (result?.error) setError('Invalid email or password');
      else { router.push('/'); router.refresh(); }
    } catch { setError('Something went wrong'); }
    finally { setLoading(false); }
  };

  return (
    <div className="auth-page">
      <div className="auth-bg-orbs">
        <div className="auth-orb auth-orb-1" />
        <div className="auth-orb auth-orb-2" />
        <div className="auth-orb auth-orb-3" />
      </div>
      <div className="auth-container fade-in">
        <div className="auth-header">
          <div className="auth-logo"><Gamepad2 size={32} /></div>
          <h1 className="auth-title">Welcome back</h1>
          <p className="auth-subtitle">Sign in to your Co-Op workspace</p>
        </div>
        <form onSubmit={handleSubmit} className="auth-form">
          {error && <div className="auth-error">{error}</div>}
          <div className="form-group">
            <label className="form-label" htmlFor="email">Email</label>
            <div className="auth-input-wrapper">
              <Mail size={18} className="auth-input-icon" />
              <input id="email" type="email" className="input auth-input" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="password">Password</label>
            <div className="auth-input-wrapper">
              <Lock size={18} className="auth-input-icon" />
              <input id="password" type="password" className="input auth-input" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            </div>
          </div>
          <button type="submit" className="btn btn-primary btn-lg auth-submit" disabled={loading}>
            {loading ? <Loader2 size={18} className="spin" /> : <><span>Sign in</span><ArrowRight size={18} /></>}
          </button>
        </form>
        <div className="auth-footer">
          <span className="text-secondary">Don&apos;t have an account?</span>
          <Link href="/register" className="auth-link">Create workspace</Link>
        </div>
      </div>
      <style jsx global>{`
        .auth-page { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: var(--space-4); position: relative; overflow: hidden; }
        .auth-bg-orbs { position: fixed; inset: 0; pointer-events: none; z-index: 0; }
        .auth-orb { position: absolute; border-radius: 50%; filter: blur(80px); opacity: 0.4; }
        .auth-orb-1 { width: 400px; height: 400px; background: rgba(99,102,241,0.3); top: -100px; right: -100px; animation: authFloat 8s ease-in-out infinite; }
        .auth-orb-2 { width: 300px; height: 300px; background: rgba(139,92,246,0.25); bottom: -50px; left: -50px; animation: authFloat 10s ease-in-out infinite reverse; }
        .auth-orb-3 { width: 200px; height: 200px; background: rgba(168,85,247,0.2); top: 40%; left: 30%; animation: authFloat 12s ease-in-out infinite; }
        @keyframes authFloat { 0%,100%{transform:translateY(0) scale(1);} 50%{transform:translateY(-20px) scale(1.05);} }
        .auth-container { width: 100%; max-width: 420px; padding: var(--space-10); background: var(--color-surface); backdrop-filter: blur(24px); border: 1px solid var(--color-surface-border); border-radius: var(--radius-2xl); box-shadow: var(--shadow-xl); position: relative; z-index: 1; }
        .auth-header { text-align: center; margin-bottom: var(--space-8); }
        .auth-logo { width: 56px; height: 56px; margin: 0 auto var(--space-4); display: flex; align-items: center; justify-content: center; background: var(--color-accent-gradient); border-radius: var(--radius-xl); color: white; box-shadow: var(--shadow-glow); }
        .auth-title { font-size: var(--font-size-2xl); font-weight: var(--font-weight-bold); color: var(--color-text-primary); margin-bottom: var(--space-2); }
        .auth-subtitle { color: var(--color-text-secondary); font-size: var(--font-size-base); }
        .auth-form { display: flex; flex-direction: column; gap: var(--space-5); }
        .auth-input-wrapper { position: relative; }
        .auth-input-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--color-text-tertiary); pointer-events: none; z-index: 1; }
        .auth-input { padding-left: 40px !important; }
        .auth-error { padding: var(--space-3); background: var(--color-error-muted); border: 1px solid rgba(239,68,68,0.3); border-radius: var(--radius-md); color: var(--color-error); font-size: var(--font-size-sm); text-align: center; }
        .auth-submit { width: 100%; margin-top: var(--space-2); }
        .auth-footer { text-align: center; margin-top: var(--space-6); font-size: var(--font-size-sm); display: flex; align-items: center; justify-content: center; gap: var(--space-2); }
        .auth-link { color: var(--color-accent); font-weight: var(--font-weight-medium); }
        .auth-link:hover { color: var(--color-accent-hover); }
      `}</style>
    </div>
  );
}
