import { useState, type FormEvent } from 'react';
import { ArrowUpRight, LockKeyhole, Mail, PackageCheck, ShieldCheck, Sparkles } from 'lucide-react';
import { PRESET_DEMO_ACCOUNTS } from '../../lib/demoStore';

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

  async function handleQuickLaunch(demoEmail: string) {
    setEmail(demoEmail);
    setPassword(demoEmail);
    setLocalError(null);
    setSigningIn(true);
    try {
      await onSignIn(demoEmail, demoEmail);
    } catch {
      setLocalError('Unable to launch demo. Please try again.');
    } finally {
      setSigningIn(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-mark">
        <span className="brand-glyph"><PackageCheck size={24} strokeWidth={1.8} /></span>
        <span>LAST-MILE<span className="brand-x">X</span></span>
      </div>

      <section className="auth-card">
        <div className="eyebrow">
          <span className="live-dot" /> FIELD DISPATCH / ACCESS
        </div>
        <h1>Move the right<br /><em>aid, on time.</em></h1>
        <p className="auth-copy">
          A live board for matching short-life donations with shelter demand, rider capacity, and what’s actually available at the door.
        </p>

        {/* Demo / Judge Quick Access Card */}
        <div className="demo-access-card">
          <div className="demo-access-head">
            <span className="demo-access-badge">
              <Sparkles size={13} /> JUDGE DEMO ACCESS
            </span>
            <span className="demo-access-hint">Password is identical to email</span>
          </div>
          <p className="demo-access-subtitle">
            Instant 1-click evaluation profiles with pre-configured operational states:
          </p>
          <div className="demo-quick-grid">
            {PRESET_DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.email}
                type="button"
                className={`demo-launch-btn demo-role-${account.role}`}
                disabled={signingIn}
                onClick={() => void handleQuickLaunch(account.email)}
                title={`${account.displayName} — ${account.description}`}
              >
                <span className="demo-btn-title">
                  {account.role === 'admin' && '⚖️'}
                  {account.role === 'donor' && '📦'}
                  {account.role === 'rider' && '🚴'}
                  {account.role === 'shelter' && '🏠'}
                  {' '}{account.displayName}
                </span>
                <span className="demo-btn-email">{account.email}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="auth-divider">
          <span>OR SIGN IN MANUALLY</span>
        </div>

        <form className="auth-form" onSubmit={submit}>
          <label htmlFor="email">Email</label>
          <div className="input-wrap">
            <Mail size={17} aria-hidden="true" />
            <input
              id="email"
              type="email"
              autoComplete="username"
              placeholder="judge@lastmilex.app"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>

          <label htmlFor="password">Password (Same as email for demo accounts)</label>
          <div className="input-wrap">
            <LockKeyhole size={17} aria-hidden="true" />
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="Same as email for demo"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>

          <button
            className="primary-button auth-submit"
            type="submit"
            disabled={signingIn}
          >
            {signingIn ? 'Signing in…' : 'Sign in'} <ArrowUpRight size={17} />
          </button>

          {!isOnline && (
            <p className="form-error" role="status">
              Offline — password sign-in needs a connection. The app shell remains available.
            </p>
          )}
          {(localError || error) && (
            <p className="form-error" role="alert">{localError ?? error}</p>
          )}
        </form>

        <div className="auth-foot">
          <ShieldCheck size={16} />
          <span>
            Judge & Demo Mode Active. Role access is automatically assigned. Any demo email with matching password signs in directly.
          </span>
        </div>
      </section>

      <aside className="auth-side-note">
        <span>LIVE LOGISTICS / 01</span>
        <span>Food doesn’t wait.<br />Neither should the handoff.</span>
      </aside>
    </main>
  );
}
