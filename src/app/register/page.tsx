'use client';
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Mail, Lock, User, Building2, ArrowRight, Loader2 } from 'lucide-react';
import CoOpLogo from '@/components/CoOpLogo';

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: '', email: '', password: '', companyName: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Registration failed'); return; }
      const result = await signIn('credentials', { email: form.email, password: form.password, redirect: false });
      if (result?.error) { setError('Account created but sign-in failed. Please log in.'); router.push('/login'); }
      else { router.push('/'); router.refresh(); }
    } catch { setError('Something went wrong'); }
    finally { setLoading(false); }
  };

  return (
    <div className="auth-page">
      <div className="auth-container fade-in">
        <div className="auth-header">
          <div className="auth-logo"><CoOpLogo size={28} /></div>
          <h1 className="auth-title">Create your workspace</h1>
          <p className="auth-subtitle">Start building your company with AI</p>
        </div>
        <form onSubmit={handleSubmit} className="auth-form">
          {error && <div className="auth-error">{error}</div>}
          <div className="form-group">
            <label className="form-label" htmlFor="companyName">Company name</label>
            <div className="auth-input-wrapper"><Building2 size={18} className="auth-input-icon" /><input id="companyName" name="companyName" type="text" className="input auth-input" placeholder="Acme Inc." value={form.companyName} onChange={handleChange} required autoFocus /></div>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="name">Your name</label>
            <div className="auth-input-wrapper"><User size={18} className="auth-input-icon" /><input id="name" name="name" type="text" className="input auth-input" placeholder="John Doe" value={form.name} onChange={handleChange} required /></div>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="email">Email</label>
            <div className="auth-input-wrapper"><Mail size={18} className="auth-input-icon" /><input id="email" name="email" type="email" className="input auth-input" placeholder="you@company.com" value={form.email} onChange={handleChange} required /></div>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="password">Password</label>
            <div className="auth-input-wrapper"><Lock size={18} className="auth-input-icon" /><input id="password" name="password" type="password" className="input auth-input" placeholder="Min. 6 characters" value={form.password} onChange={handleChange} required minLength={6} /></div>
          </div>
          <button type="submit" className="btn btn-primary btn-lg auth-submit" disabled={loading}>
            {loading ? <Loader2 size={18} className="spin" /> : <><span>Create workspace</span><ArrowRight size={18} /></>}
          </button>
        </form>
        <div className="auth-footer">
          <span className="text-secondary">Already have an account?</span>
          <Link href="/login" className="auth-link">Sign in</Link>
        </div>
      </div>
      <style jsx global>{`
        .auth-page { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: var(--space-4); position: relative; overflow: hidden; background: var(--color-bg-primary); }
        .auth-page::before { content: ''; position: fixed; top: -200px; left: -200px; width: 500px; height: 500px; background: radial-gradient(circle, rgba(0,217,146,0.06) 0%, transparent 70%); pointer-events: none; }
        .auth-page::after { content: ''; position: fixed; bottom: -150px; right: -150px; width: 400px; height: 400px; background: radial-gradient(circle, rgba(0,217,146,0.04) 0%, transparent 70%); pointer-events: none; }
        .auth-container { width: 100%; max-width: 420px; padding: var(--space-10); background: var(--color-surface); border: 1px solid var(--color-surface-border); border-radius: var(--radius-lg); position: relative; z-index: 1; }
        .auth-header { text-align: center; margin-bottom: var(--space-8); }
        .auth-logo { width: 56px; height: 56px; margin: 0 auto var(--space-4); display: flex; align-items: center; justify-content: center; background: var(--color-bg-tertiary); border: 2px solid var(--color-accent); border-radius: var(--radius-lg); color: #00d992; animation: authGlow 3s ease-in-out infinite; }
        @keyframes authGlow { 0%,100% { box-shadow: 0 0 4px rgba(0,217,146,0.3); } 50% { box-shadow: 0 0 16px rgba(0,217,146,0.5); } }
        .auth-title { font-family: var(--font-family-heading); font-size: var(--font-size-2xl); font-weight: var(--font-weight-bold); color: var(--color-text-primary); margin-bottom: var(--space-2); letter-spacing: -0.5px; }
        .auth-subtitle { color: var(--color-text-secondary); font-size: var(--font-size-base); }
        .auth-form { display: flex; flex-direction: column; gap: var(--space-5); }
        .auth-input-wrapper { position: relative; }
        .auth-input-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--color-text-tertiary); pointer-events: none; z-index: 1; }
        .auth-input { padding-left: 40px !important; }
        .auth-error { padding: var(--space-3); background: var(--color-error-muted); border: 1px solid rgba(251,86,91,0.3); border-radius: var(--radius-md); color: var(--color-error); font-size: var(--font-size-sm); text-align: center; }
        .auth-submit { width: 100%; margin-top: var(--space-2); }
        .auth-footer { text-align: center; margin-top: var(--space-6); font-size: var(--font-size-sm); display: flex; align-items: center; justify-content: center; gap: var(--space-2); }
        .auth-link { color: var(--color-accent); font-weight: var(--font-weight-medium); }
        .auth-link:hover { color: var(--color-accent-hover); }
      `}</style>
    </div>
  );
}
