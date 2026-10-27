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
        if (!data.session) setInfo('Check your email for a confirmation link, then log in.');
      } else {
        const { error } = await sb.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setInfo('If that email has an account, a reset link is on its way.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="narrow">
      <div className="card stack">
        <h1>{mode === 'signin' ? 'Log in' : mode === 'signup' ? 'Create an account' : 'Reset password'}</h1>
        <form onSubmit={submit} className="stack">
          <div>
            <label htmlFor="email">Email</label>
            <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {mode !== 'reset' && (
            <div>
              <label htmlFor="password">Password</label>
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
            {busy ? 'Please wait…' : mode === 'signin' ? 'Log in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
          </button>
        </form>
        <div className="small muted stack">
          {mode !== 'signin' && <button className="btn btn-sm" onClick={() => setMode('signin')}>I have an account</button>}
          {mode !== 'signup' && <button className="btn btn-sm" onClick={() => setMode('signup')}>New vendor? Create an account</button>}
          {mode === 'signin' && <button className="btn btn-sm" onClick={() => setMode('reset')}>Forgot password</button>}
        </div>
      </div>
    </div>
  );
}
