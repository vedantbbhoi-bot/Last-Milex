import { useState, type FormEvent } from 'react';
import { ArrowUpRight, LockKeyhole, ShieldCheck } from 'lucide-react';

const MIN_PASSWORD_LENGTH = 8;

interface Props {
  error: string | null;
  onSetPassword: (password: string) => Promise<{ ok: boolean }>;
}

export function SetPasswordForm({ error, onSetPassword }: Props) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError(null);
    if (password.length < MIN_PASSWORD_LENGTH) {
      setLocalError(`Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`);
      return;
    }
    if (password !== confirmation) {
      setLocalError('The passwords do not match.');
      return;
    }

    setSaving(true);
    try {
      const result = await onSetPassword(password);
      if (result.ok) setSaved(true);
    } catch {
      setLocalError('Password could not be updated. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="auth-card" aria-labelledby="set-password-title">
      <div className="eyebrow"><span className="live-dot" /> ACCOUNT SECURITY</div>
      <h1 id="set-password-title">Set your<br /><em>password.</em></h1>
      <p className="auth-copy">Choose a password to finish setting up password sign-in for your account.</p>
      {saved ? (
        <div className="sent-panel" role="status">
          <span className="sent-icon"><ShieldCheck size={19} /></span>
          <div><strong>Password saved.</strong><span>Your account is ready to continue.</span></div>
        </div>
      ) : (
        <form className="auth-form" onSubmit={submit}>
          <label htmlFor="new-password">New password</label>
          <div className="input-wrap"><LockKeyhole size={17} aria-hidden="true" /><input id="new-password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={MIN_PASSWORD_LENGTH} required /></div>
          <label htmlFor="confirm-password">Confirm new password</label>
          <div className="input-wrap"><LockKeyhole size={17} aria-hidden="true" /><input id="confirm-password" type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} minLength={MIN_PASSWORD_LENGTH} required /></div>
          <p className="auth-copy">Use at least {MIN_PASSWORD_LENGTH} characters.</p>
          <button className="primary-button auth-submit" type="submit" disabled={saving || password.length < MIN_PASSWORD_LENGTH || password !== confirmation}>
            {saving ? 'Saving password…' : 'Set password'} <ArrowUpRight size={17} />
          </button>
          {(localError || error) && <p className="form-error" role="alert">{localError ?? error}</p>}
        </form>
      )}
      <div className="auth-foot"><ShieldCheck size={16} /><span>Your password is saved securely by the authentication service.</span></div>
    </section>
  );
}
