/**
 * lib/api.ts — browser helper for calling our own API routes.
 *
 * CONCEPT: attaches the logged-in user's access token so the server can tell
 * who is calling (see lib/server/auth.ts), and turns non-2xx responses into
 * thrown errors carrying the server's message, so pages can simply
 * `try { await api(...) } catch (e) { show(e.message) }`.
 */
'use client';

import { supabaseBrowser } from './supabaseBrowser';

export class ApiError extends Error {
  constructor(public status: number, message: string, public body: Record<string, unknown>) {
    super(message);
  }
}

/**
 * Call an API route.
 * @param path  e.g. '/api/events'
 * @param init  fetch options; a plain object `body` is JSON-encoded automatically
 *              (FormData is passed through untouched for file uploads).
 */
export async function api<T = unknown>(
  path: string,
  init: Omit<RequestInit, 'body'> & { body?: unknown } = {},
): Promise<T> {
  const { data } = await supabaseBrowser().auth.getSession();
  const headers = new Headers(init.headers);
  if (data.session) headers.set('Authorization', `Bearer ${data.session.access_token}`);

  let body: BodyInit | undefined;
  if (init.body instanceof FormData) {
    body = init.body;
  } else if (init.body !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(init.body);
  }

  const res = await fetch(path, { ...init, headers, body, cache: 'no-store' });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new ApiError(res.status, String(json.error ?? `Request failed (${res.status})`), json);
  return json as T;
}
