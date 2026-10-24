import { useState, type FormEvent } from 'react';
import { ArrowUpRight, Mail, PackageCheck, ShieldCheck } from 'lucide-react';
import { isSupabaseConfigured } from '../../lib/supabase/client';

interface Props {
  error: string | null;
  onSend: (email: string) => Promise<{ ok: boolean }>;
}

export function MagicLinkGate({ error, onSend }: Props) {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError(null);
    setSending(true);
    const result = await onSend(email.trim());
    setSending(false);
    setSent(result.ok);
  }

  return (
    <main className="auth-page">
      <div className="auth-mark"><span className="brand-glyph"><PackageCheck size={24} strokeWidth={1.8} /></span><span>LAST-MILE<span className="brand-x">X</span></span></div>
      <section className="auth-card">
        <div className="eyebrow"><span className="live-dot" /> FIELD DISPATCH / ACCESS</div>
        <h1>Move the right<br /><em>aid, on time.</em></h1>
        <p className="auth-copy">A live board for matching short-life donations with shelter demand, rider capacity, and what’s actually available at the door.</p>
        {sent ? (
          <div className="sent-panel" role="status">
            <span className="sent-icon"><Mail size={19} /></span>
            <div><strong>Check your inbox.</strong><span>A sign-in link is on its way to {email.trim()}.</span></div>
          </div>
        ) : (
          <form className="auth-form" onSubmit={submit}>
            <label htmlFor="email">Work email</label>
            <div className="input-wrap"><Mail size={17} aria-hidden="true" /><input id="email" type="email" autoComplete="email" placeholder="you@organization.org" value={email} onChange={(event) => setEmail(event.target.value)} required /></div>
            <button className="primary-button auth-submit" type="submit" disabled={sending || !isSupabaseConfigured}>
              {sending ? 'Sending link…' : 'Email me a sign-in link'} <ArrowUpRight size={17} />
            </button>
            {!isSupabaseConfigured && <p className="form-error">Supabase project URL or publishable key is missing from this environment.</p>}
            {(localError || error) && <p className="form-error" role="alert">{localError ?? error}</p>}
          </form>
        )}
        <div className="auth-foot"><ShieldCheck size={16} /><span>Role access is assigned by an administrator. Your login link never changes your role.</span></div>
      </section>
      <aside className="auth-side-note"><span>LIVE LOGISTICS / 01</span><span>Food doesn’t wait.<br />Neither should the handoff.</span></aside>
    </main>
  );
}
