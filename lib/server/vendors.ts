/**
 * lib/server/vendors.ts — shared vendor helpers for admin routes.
 */
import type { Vendor } from '../types';

/** Fields an admin may set on a vendor, trimmed, with blanks → null. */
export function vendorFields(input: Partial<Vendor>): Partial<Vendor> {
  const out: Partial<Vendor> = {};
  const text = ['business_name', 'contact_name', 'phone', 'email', 'category', 'notes'] as const;
  for (const k of text) {
    if (input[k] !== undefined) (out as Record<string, unknown>)[k] = (input[k] as string | null)?.trim() || null;
  }
  if (input.whatsapp_opt_in !== undefined) out.whatsapp_opt_in = !!input.whatsapp_opt_in;
  if (input.is_active !== undefined) out.is_active = !!input.is_active;
  return out;
}
