/**
 * lib/server/vendors.ts — shared vendor helpers for API routes.
 *
 * CONCEPT: two audiences edit vendor records:
 *   - admins (Vendors screen) may set every field, including the vendor ID
 *     code, internal notes and active flag;
 *   - vendors (their own Profile page) may only set their public details.
 * `cleanVendorInput` trims/validates the input once for both, and the
 * `admin` flag decides which fields are allowed through.
 */
import { supabase } from './supabase';
import { HttpError } from './auth';
import { normalizeUrl } from '../util';
import type { Vendor } from '../types';

/** Columns to select for admin views: every vendor column + the type name. */
export const VENDOR_SELECT = '*, vendor_type:vendor_types(name)';

/** Fields a vendor may edit on their own profile. */
const SELF_TEXT = ['business_name', 'contact_name', 'phone', 'offerings', 'address', 'website'] as const;
/** Extra fields only admins may edit. */
const ADMIN_TEXT = ['email', 'notes', 'vendor_code'] as const;

/**
 * Normalise a vendor form submission.
 * - Text fields are trimmed; blanks become null.
 * - Only keys actually present in `input` are returned, so PATCH requests
 *   can update a single field without clearing the others.
 * - Websites get 'https://' added if the user typed just 'example.com'.
 */
export function cleanVendorInput(input: Partial<Vendor>, opts: { admin: boolean }): Partial<Vendor> {
  const out: Record<string, unknown> = {};
  const keys = opts.admin ? [...SELF_TEXT, ...ADMIN_TEXT] : SELF_TEXT;
  for (const k of keys) {
    if (input[k] !== undefined) out[k] = (input[k] as string | null)?.trim() || null;
  }

  if (typeof out.website === 'string') out.website = normalizeUrl(out.website);

  // Social links: a list. Trim, drop blanks, add https://, remove duplicates,
  // and cap the count/length so a bad request can't store junk.
  if (input.social_links !== undefined) {
    if (!Array.isArray(input.social_links)) throw new HttpError(400, 'Invalid social links');
    const links = input.social_links
      .map((l) => String(l ?? '').trim())
      .filter(Boolean)
      .map(normalizeUrl);
    if (links.some((l) => l.length > 300)) throw new HttpError(400, 'A social link is too long');
    out.social_links = [...new Set(links)].slice(0, 10);
  }
  if ('vendor_code' in out) {
    // The code can be changed but not cleared (it's NOT NULL in the DB).
    if (!out.vendor_code) delete out.vendor_code;
    else out.vendor_code = String(out.vendor_code).toUpperCase();
  }
  if (input.vendor_type_id !== undefined) {
    const t = input.vendor_type_id === null || (input.vendor_type_id as unknown) === '' ? null : Number(input.vendor_type_id);
    if (t !== null && !Number.isInteger(t)) throw new HttpError(400, 'Invalid vendor type');
    out.vendor_type_id = t;
  }
  if (input.whatsapp_opt_in !== undefined) out.whatsapp_opt_in = !!input.whatsapp_opt_in;
  if (opts.admin && input.is_active !== undefined) out.is_active = !!input.is_active;

  return out as Partial<Vendor>;
}

/**
 * Turn Postgres errors from a vendor insert/update into friendly messages.
 * 23505 = unique violation (duplicate vendor ID code);
 * 23503 = foreign key violation (vendor type that doesn't exist).
 */
export function vendorWriteError(error: { code?: string; message: string }): HttpError {
  if (error.code === '23505' && error.message.includes('vendor_code')) {
    return new HttpError(409, 'That vendor ID is already used by another vendor');
  }
  if (error.code === '23503') return new HttpError(400, 'Invalid vendor type');
  return new HttpError(500, error.message);
}

/** Insert or update a vendor and return the saved row (with type name). */
export async function saveVendor(fields: Partial<Vendor>, id?: string): Promise<Vendor | null> {
  const q = id
    ? supabase.from('vendors').update(fields).eq('id', id).select(VENDOR_SELECT).maybeSingle()
    : supabase.from('vendors').insert(fields).select(VENDOR_SELECT).single();
  const { data, error } = await q;
  if (error) throw vendorWriteError(error);
  return data as Vendor | null;
}

/**
 * Find a vendor type by name, or create it. Used when a vendor (or admin)
 * picks "Other" and types their own category.
 *
 * CONCEPT: match case-insensitively and ignore extra spaces, so "food",
 * "Food" and " FOOD " all land on the same type instead of three near-
 * duplicates. New types go to the end of the list. If two people add the
 * same new type at the same moment, the unique name constraint makes the
 * second insert fail; we then just look the type up again.
 */
export async function resolveVendorType(rawName: string): Promise<number> {
  const name = rawName.trim().replace(/\s+/g, ' ').slice(0, 40);
  if (!name) throw new HttpError(400, 'Please type the vendor type');

  const find = async () => {
    // ilike without wildcards = case-insensitive equality (escape % and _).
    const { data } = await supabase
      .from('vendor_types')
      .select('id')
      .ilike('name', name.replace(/[\\%_]/g, '\\$&'))
      .limit(1)
      .maybeSingle();
    return (data as { id: number } | null)?.id ?? null;
  };

  const existing = await find();
  if (existing) return existing;

  const { data: last } = await supabase.from('vendor_types').select('sort_order').order('sort_order', { ascending: false }).limit(1);
  const { data, error } = await supabase
    .from('vendor_types')
    .insert({ name, sort_order: ((last as { sort_order: number }[] | null)?.[0]?.sort_order ?? 0) + 1 })
    .select('id')
    .single();
  if (error) {
    const again = error.code === '23505' ? await find() : null;
    if (again) return again;
    throw new HttpError(500, error.message);
  }
  return (data as { id: number }).id;
}

/**
 * Apply the "Other: type your own" choice: if the form sent a typed
 * vendor_type_name, resolve it to an id and put that on the fields.
 */
export async function applyTypedVendorType(
  input: { vendor_type_name?: string | null },
  fields: Partial<Vendor>,
): Promise<void> {
  if (typeof input.vendor_type_name === 'string' && input.vendor_type_name.trim()) {
    fields.vendor_type_id = await resolveVendorType(input.vendor_type_name);
  }
}

/**
 * Contact person and phone are mandatory on vendor and admin forms.
 * `partial` (admin edits): only complain about fields actually sent blank,
 * so updating one field of an imported vendor with gaps still works.
 */
export function requireContactFields(fields: Partial<Vendor>, opts: { partial?: boolean } = {}): void {
  const missing = (k: 'contact_name' | 'phone') => (opts.partial ? k in fields && !fields[k] : !fields[k]);
  if (missing('contact_name')) throw new HttpError(400, 'Contact person is required');
  if (missing('phone')) throw new HttpError(400, 'Phone number is required');
}
