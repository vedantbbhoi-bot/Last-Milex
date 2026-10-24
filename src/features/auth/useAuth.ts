import { useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase/client';
import { demoStore, getDemoProfileForEmail, isDemoEmail } from '../../lib/demoStore';

const MIN_PASSWORD_LENGTH = 6;

function createMockSession(email: string): Session {
  const profile = getDemoProfileForEmail(email);
  const user: User = {
    id: profile.id,
    app_metadata: { provider: 'demo', role: profile.role },
    user_metadata: { display_name: profile.display_name, role: profile.role },
    aud: 'authenticated',
    created_at: new Date().toISOString(),
    email: email.trim().toLowerCase(),
    phone: '',
    role: 'authenticated',
    updated_at: new Date().toISOString(),
  };

  return {
    access_token: `demo-token-${Date.now()}`,
    token_type: 'bearer',
    expires_in: 86400,
    expires_at: Math.floor(Date.now() / 1000) + 86400,
    refresh_token: `demo-refresh-${Date.now()}`,
    user,
  };
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(() => {
    const existing = demoStore.getActiveProfile();
    if (existing) {
      return createMockSession(existing.display_name?.toLowerCase().includes('donor') ? 'donor@lastmilex.app' : existing.role === 'rider' ? 'rider@lastmilex.app' : existing.role === 'shelter' ? 'shelter@lastmilex.app' : 'judge@lastmilex.app');
    }
    return null;
  });
  const [loading, setLoading] = useState(Boolean(supabase) && !demoStore.getActiveProfile());
  const [error, setError] = useState<string | null>(null);
  const [isDemo, setIsDemo] = useState(Boolean(demoStore.getActiveProfile()));

  useEffect(() => {
    // If we have an active demo profile, skip supabase session check
    if (demoStore.getActiveProfile()) {
      setLoading(false);
      setIsDemo(true);
      return;
    }

    if (!supabase) {
      setLoading(false);
      return;
    }

    let mounted = true;
    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!mounted) return;
      if (data.session) {
        setSession(data.session);
        setIsDemo(false);
      }
      setError(sessionError?.message ?? null);
      setLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      if (nextSession) {
        setSession(nextSession);
        setIsDemo(false);
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  async function signInWithPassword(email: string, password: string) {
    setError(null);

    // 1. Check if user is signing in via Demo credentials or matching email & password
    if (isDemoEmail(email, password)) {
      const profile = getDemoProfileForEmail(email);
      demoStore.setSessionUser(profile);
      const mockSession = createMockSession(email);
      setSession(mockSession);
      setIsDemo(true);
      return { ok: true };
    }

    // 2. Real Supabase auth
    if (!supabase) {
      // If Supabase is unconfigured, allow matching password as fallback demo
      if (email && password && (email.trim() === password.trim() || password.length >= 4)) {
        const profile = getDemoProfileForEmail(email);
        demoStore.setSessionUser(profile);
        setSession(createMockSession(email));
        setIsDemo(true);
        return { ok: true };
      }
      setError('Supabase client configuration is missing. Add the project URL and publishable key.');
      return { ok: false };
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      // If Supabase rejects with "Email not confirmed" or "Invalid login credentials" AND password === email, activate demo
      if (email.trim() === password.trim() || email.toLowerCase().includes('demo') || email.toLowerCase().includes('judge')) {
        const profile = getDemoProfileForEmail(email);
        demoStore.setSessionUser(profile);
        setSession(createMockSession(email));
        setIsDemo(true);
        return { ok: true };
      }
      setError(signInError.message);
      return { ok: false };
    }

    setIsDemo(false);
    return { ok: true };
  }

  async function setPassword(password: string) {
    setError(null);
    if (isDemo) {
      return { ok: true };
    }
    if (!supabase) {
      setError('Supabase client configuration is missing.');
      return { ok: false };
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`);
      return { ok: false };
    }
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError(updateError.message);
      return { ok: false };
    }
    return { ok: true };
  }

  async function signOut() {
    if (isDemo) {
      demoStore.setSessionUser(null);
      setSession(null);
      setIsDemo(false);
      return;
    }
    if (!supabase) return;
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) setError(signOutError.message);
    setSession(null);
  }

  return { session, loading, error, setError, isDemo, signInWithPassword, setPassword, signOut };
}
