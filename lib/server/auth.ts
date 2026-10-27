/**
 * lib/server/auth.ts — request authentication + error handling for API routes.
 *
 * CONCEPT: the browser logs in with Supabase Auth and sends its access token
 * as `Authorization: Bearer <token>` on every API call (see lib/api.ts).
 * Here we verify that token with Supabase, then look up whether the user is
 * an admin and/or has a vendor profile. Route handlers call `requireUser` or
 * `requireAdmin` at the top and get a typed context back, or the request is
 * rejected with 401/403.
 */
import { NextResponse } from 'next/server';
import { supabase } from './supabase';
import type { Vendor } from '../types';

/** Error type that carries an HTTP status, so handlers can just `throw`. */
export class HttpError extends Error {
  constructor(public status: number, message: string, public extra?: Record<string, unknown>) {
    super(message);
  }
}

export interface AuthContext {
  userId: string;
  email: string | null;
  isAdmin: boolean;
  vendor: Vendor | null;
}

/**
 * Resolve the caller from the bearer token.
 * Returns null when there is no token or it is invalid/expired.
 */
export async function getAuthContext(req: Request): Promise<AuthContext | null> {
  const header = req.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;

  // Ask Supabase Auth to validate the JWT and return the user it belongs to.
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  const user = data.user;

  // Admin flag and vendor profile are independent: an admin may also be a
  // vendor (handy for testing), and most vendors are not admins.
  const [adminRes, vendorRes] = await Promise.all([
    supabase.from('admins').select('auth_user_id').eq('auth_user_id', user.id).maybeSingle(),
    supabase.from('vendors').select('*').eq('auth_user_id', user.id).maybeSingle(),
  ]);

  return {
    userId: user.id,
    email: user.email ?? null,
    isAdmin: !!adminRes.data,
    vendor: (vendorRes.data as Vendor | null) ?? null,
  };
}

/** Any logged-in user. Throws 401 otherwise. */
export async function requireUser(req: Request): Promise<AuthContext> {
  const ctx = await getAuthContext(req);
  if (!ctx) throw new HttpError(401, 'Please log in');
  return ctx;
}

/** A logged-in user who has completed their vendor profile. */
export async function requireVendor(req: Request): Promise<AuthContext & { vendor: Vendor }> {
  const ctx = await requireUser(req);
  if (!ctx.vendor) throw new HttpError(403, 'Please complete your vendor profile first');
  if (!ctx.vendor.is_active) throw new HttpError(403, 'Your vendor account is inactive. Please contact us.');
  return ctx as AuthContext & { vendor: Vendor };
}

/** A logged-in user listed in the `admins` table. Throws 403 otherwise. */
export async function requireAdmin(req: Request): Promise<AuthContext> {
  const ctx = await requireUser(req);
  if (!ctx.isAdmin) throw new HttpError(403, 'Admins only');
  return ctx;
}

/**
 * Wrap a route handler so thrown HttpErrors (and unexpected errors) become
 * JSON responses. Keeps each route free of repetitive try/catch blocks.
 *
 * Usage: export const GET = handle(async (req) => { ...; return NextResponse.json(x); });
 */
export function handle<A extends unknown[]>(fn: (req: Request, ...args: A) => Promise<Response>) {
  return async (req: Request, ...args: A): Promise<Response> => {
    try {
      return await fn(req, ...args);
    } catch (err) {
      if (err instanceof HttpError) {
        return NextResponse.json({ error: err.message, ...err.extra }, { status: err.status });
      }
      console.error(err);
      return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
    }
  };
}

/** Throw a 500 if a Supabase call returned an error; otherwise return data. */
export function must<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new HttpError(500, res.error.message);
  return res.data;
}
