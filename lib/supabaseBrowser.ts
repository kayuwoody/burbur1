/**
 * lib/supabaseBrowser.ts — browser-side Supabase client, used ONLY for auth.
 *
 * CONCEPT: the anon key is safe to expose; it can sign users in/out and
 * hold their session (stored in localStorage), but because every table is
 * read through our own API routes, it is never used to query data directly.
 */
'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

/** Lazily create a single shared client (avoids multiple auth listeners). */
export function supabaseBrowser(): SupabaseClient {
  if (!client) {
    client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return client;
}
