/**
 * /login — sign in or create an account (email + password via Supabase Auth).
 *
 * After login the user goes back to `?next=` (where the guard sent them from),
 * or home. First-time vendors are then bounced to /profile by the page guard.
 */
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabaseBrowser';
import { useAuth } from '@/components/AuthProvider';
import { useT } from '@/components/LanguageProvider';

/** Read ?next= without useSearchParams (avoids a Suspense boundary). Only same-site paths. */
function nextPath(): string {
  if (typeof window === 'undefined') return '/';
  const n = new URLSearchParams(window.location.search).get('next');
  return n && n.startsWith('/') && !n.startsWith('//') ? n : '/';
}

export default function LoginPage() {
  const router = useRouter();
  const { session, me, loading } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const { t } = useT();

  // Already logged in → continue to where they were going.
  useEffect(() => {
    if (!loading && session && me) router.replace(nextPath());
  }, [loading, session, me, router]);

  /** Submit handler for all three modes. */
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    const sb = supabaseBrowser();
    try {
      if (mode === 'signin') {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // AuthProvider picks up the session; the effect above redirects.
      } else if (mode === 'signup') {
        const { data, error } = await sb.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/login?next=${encodeURIComponent(nextPath())}` },
        });
        if (error) throw error;
        // With email confirmation on (recommended), there's no session yet.
        if (!data.session) setInfo(t('login.checkEmail'));
      } else {
        const { error } = await sb.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setInfo(t('login.resetSent'));
      }
    } catch (err) {
      // Supabase's most common message gets a translated version; others show as-is.
      const msg = err instanceof Error ? err.message : t('common.error');
      setError(/invalid login credentials/i.test(msg) ? t('login.invalid') : msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="narrow" style={{ paddingTop: 16 }}>
      <div className="card stack auth-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="auth-logo" src="/brand/gvo-logo-256.png" alt="Good Vibes Only Market" />
        <h1>{t(mode === 'signin' ? 'login.signin' : mode === 'signup' ? 'login.signup' : 'login.reset')}</h1>
        <form onSubmit={submit} className="stack">
          <div>
            <label htmlFor="email">{t('login.email')}</label>
            <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {mode !== 'reset' && (
            <div>
              <label htmlFor="password">{t('login.password')}</label>
              <input
                id="password"
                type="password"
                required
                minLength={6}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          )}
          {error && <p className="error small">{error}</p>}
          {info && <p className="success small">{info}</p>}
          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? t('login.wait') : t(mode === 'signin' ? 'login.btnSignin' : mode === 'signup' ? 'login.btnSignup' : 'login.btnReset')}
          </button>
        </form>
        <div className="auth-links">
          {mode !== 'signin' && <button className="link-btn" onClick={() => setMode('signin')}>{t('login.haveAccount')}</button>}
          {mode !== 'signup' && <button className="link-btn" onClick={() => setMode('signup')}>{t('login.newVendor')}</button>}
          {mode === 'signin' && <button className="link-btn" onClick={() => setMode('reset')}>{t('login.forgot')}</button>}
        </div>
      </div>
    </div>
  );
}
