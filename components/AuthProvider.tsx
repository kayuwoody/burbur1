/**
 * components/AuthProvider.tsx — app-wide login state.
 *
 * CONCEPT: Supabase Auth keeps the session in the browser. This provider
 * listens for sign-in/sign-out, and whenever there's a session it asks our
 * own /api/me who the user is (vendor profile? admin?). Every page reads
 * that through `useAuth()` instead of fetching it again.
 *
 * `useRequireAuth()` is the page guard: it redirects away from pages the
 * user can't use yet (not logged in → /login, no vendor profile → /profile,
 * not admin → home). The server re-checks on every API call, so this guard
 * is for navigation only, not security.
 */
'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { Session } from '@supabase/supabase-js';
import { supabaseBrowser } from '@/lib/supabaseBrowser';
import { api } from '@/lib/api';
import type { MeResponse } from '@/lib/types';

interface AuthState {
  loading: boolean;
  session: Session | null;
  me: MeResponse | null;
  /** Re-fetch /api/me (e.g. after saving the profile). */
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  // Which user /api/me was last loaded for, to skip redundant reloads.
  const loadedFor = useRef<string | null | undefined>(undefined);

  /** Look up profile/admin status for the current session. */
  const loadMe = useCallback(async (s: Session | null) => {
    if (!s) {
      setMe(null);
      return;
    }
    try {
      setMe(await api<MeResponse>('/api/me'));
    } catch {
      setMe(null);
    }
  }, []);

  // Initial session check + subscribe to future auth changes.
  useEffect(() => {
    const sb = supabaseBrowser();
    sb.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      loadedFor.current = data.session?.user.id ?? null;
      await loadMe(data.session);
      setLoading(false);
    });
    const { data: sub } = sb.auth.onAuthStateChange((event, s) => {
      setSession(s);
      // CONCEPT: Supabase re-emits SIGNED_IN whenever the tab regains focus.
      // Only reload the profile (and show a loading state) when the actual
      // user changed: a real login, logout or account switch. Otherwise every
      // tab switch would blank the page and refetch everything.
      const uid = s?.user.id ?? null;
      if (event === 'USER_UPDATED' || uid !== loadedFor.current) {
        loadedFor.current = uid;
        setLoading(true);
        loadMe(s).finally(() => setLoading(false));
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [loadMe]);

  const value: AuthState = {
    loading,
    session,
    me,
    refresh: () => loadMe(session),
    signOut: async () => {
      await supabaseBrowser().auth.signOut();
    },
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

/** Read auth state from any client component. */
export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/**
 * Page guard. Returns `ready: true` once the user is allowed on the page;
 * until then the page should render a loading state.
 *
 * @param need 'user'   – any login
 *             'vendor' – login + completed vendor profile
 *             'admin'  – login + listed in the admins table
 */
export function useRequireAuth(need: 'user' | 'vendor' | 'admin'): AuthState & { ready: boolean } {
  const auth = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  let ready = false;
  let redirect: string | null = null;
  if (!auth.loading) {
    if (!auth.session || !auth.me) redirect = `/login?next=${encodeURIComponent(pathname)}`;
    else if (need === 'vendor' && !auth.me.vendor) redirect = `/profile?next=${encodeURIComponent(pathname)}`;
    else if (need === 'admin' && !auth.me.isAdmin) redirect = '/';
    else ready = true;
  }

  useEffect(() => {
    if (redirect) router.replace(redirect);
  }, [redirect, router]);

  return { ...auth, ready };
}
