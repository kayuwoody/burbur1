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
import type { Vendor } from '../types';

/** Columns to select for admin views: every vendor column + the type name. */
export const VENDOR_SELECT = '*, vendor_type:vendor_types(name)';

/** Fields a vendor may edit on their own profile. */
const SELF_TEXT = ['business_name', 'contact_name', 'phone', 'office_phone', 'offerings', 'address', 'website'] as const;
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

  if (typeof out.website === 'string' && !/^https?:\/\//i.test(out.website)) {
    out.website = `https://${out.website}`;
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
