/**
 * lib/server/supabase.ts — service-role Supabase client (SERVER ONLY).
 *
 * CONCEPT: every database read/write goes through API routes that use the
 * service-role key, which bypasses RLS. The browser never talks to the
 * database directly; it only uses Supabase for login (see lib/supabaseBrowser).
 * The API routes are therefore responsible for checking WHO is asking
 * (see lib/server/auth.ts) before touching data.
 *
 * Same pattern as bubu1's lib/online/supabase.ts.
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');

export const supabase = createClient(url, key, {
  auth: { persistSession: false },
  global: {
    // Prevent the Next.js data cache from serving stale reads after writes —
    // stall availability must always be live.
    fetch: (input, init) => fetch(input as RequestInfo, { ...(init as RequestInit), cache: 'no-store' }),
  },
});
