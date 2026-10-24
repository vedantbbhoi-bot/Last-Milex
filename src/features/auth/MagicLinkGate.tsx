import { useState, type FormEvent } from 'react';
import { ArrowUpRight, LockKeyhole, Mail, PackageCheck, ShieldCheck } from 'lucide-react';
import { isSupabaseConfigured } from '../../lib/supabase/client';

interface Props {
  error: string | null;
  onSignIn: (email: string, password: string) => Promise<{ ok: boolean }>;
  isOnline: boolean;
}

export function PasswordGate({ error, onSignIn, isOnline }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError(null);
    setSigningIn(true);
    try {
      await onSignIn(email.trim(), password);
    } catch {
      setLocalError('Unable to sign in right now. Please try again.');
    } finally {
      setSigningIn(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-mark"><span className="brand-glyph"><PackageCheck size={24} strokeWidth={1.8} /></span><span>LAST-MILE<span className="brand-x">X</span></span></div>
      <section className="auth-card">
        <div className="eyebrow"><span className="live-dot" /> FIELD DISPATCH / ACCESS</div>
        <h1>Move the right<br /><em>aid, on time.</em></h1>
        <p className="auth-copy">A live board for matching short-life donations with shelter demand, rider capacity, and what’s actually available at the door.</p>
        <form className="auth-form" onSubmit={submit}>
          <label htmlFor="email">Work email</label>
          <div className="input-wrap"><Mail size={17} aria-hidden="true" /><input id="email" type="email" autoComplete="username" placeholder="you@organization.org" value={email} onChange={(event) => setEmail(event.target.value)} required /></div>
          <label htmlFor="password">Password</label>
          <div className="input-wrap"><LockKeyhole size={17} aria-hidden="true" /><input id="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></div>
          <button className="primary-button auth-submit" type="submit" disabled={signingIn || !isOnline || !isSupabaseConfigured}>
            {signingIn ? 'Signing in…' : 'Sign in'} <ArrowUpRight size={17} />
          </button>
          {!isOnline && <p className="form-error" role="status">Offline — password sign-in needs a connection. The app shell remains available.</p>}
          {!isSupabaseConfigured && <p className="form-error">Supabase project URL or publishable key is missing from this environment.</p>}
          {(localError || error) && <p className="form-error" role="alert">{localError ?? error}</p>}
        </form>
        <div className="auth-foot"><ShieldCheck size={16} /><span>Role access is assigned by an administrator. Signing in does not change your role.</span></div>
      </section>
      <aside className="auth-side-note"><span>LIVE LOGISTICS / 01</span><span>Food doesn’t wait.<br />Neither should the handoff.</span></aside>
    </main>
  );
}
