/**
 * /api/me — who am I, and my vendor profile.
 *
 * GET → { user, vendor, isAdmin }  (pages use this to decide where to send you)
 * PUT → create or update the caller's own vendor profile.
 */
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/server/supabase';
import { handle, HttpError, must, requireUser } from '@/lib/server/auth';
import { cleanVendorInput, saveVendor } from '@/lib/server/vendors';
import type { MeResponse, Vendor } from '@/lib/types';

export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  const ctx = await requireUser(req);
  const body: MeResponse = {
    user: { id: ctx.userId, email: ctx.email },
    vendor: ctx.vendor,
    isAdmin: ctx.isAdmin,
  };
  return NextResponse.json(body);
});

/**
 * Save the vendor profile.
 * CONCEPT, linking existing clients: the admin may already have created a
 * vendor row (with this email) on the Vendors screen before the client ever
 * logged in. On first save we adopt that row instead of creating a duplicate,
 * so booking history and admin notes stay attached to one record.
 */
export const PUT = handle(async (req) => {
  const ctx = await requireUser(req);
  const input = (await req.json()) as Partial<Vendor>;

  // Only vendor-editable fields pass through (vendor ID code, notes and
  // active flag are admin-only). Email always comes from the login.
  const fields = { ...cleanVendorInput(input, { admin: false }), email: ctx.email };
  if (!fields.business_name) throw new HttpError(400, 'Business name is required');
  if (!fields.phone) throw new HttpError(400, 'Contact number is required');

  // Already has a profile → plain update.
  if (ctx.vendor) {
    return NextResponse.json({ vendor: await saveVendor(fields, ctx.vendor.id) });
  }

  // Admin-created row waiting for this email → claim it.
  if (ctx.email) {
    const existing = must(
      await supabase
        .from('vendors')
        .select('id')
        // ilike = case-insensitive equality here; escape its wildcards (_ %)
        // so 'a_b@x.com' can't match 'axb@x.com'.
        .ilike('email', ctx.email.replace(/[\\%_]/g, '\\$&'))
        .is('auth_user_id', null)
        .limit(1)
        .maybeSingle(),
    ) as { id: string } | null;
    if (existing) {
      // Only apply fields the vendor actually filled in, so blanks on their
      // first-time form don't wipe details the admin already recorded.
      const filled = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== null && v !== undefined));
      return NextResponse.json({ vendor: await saveVendor({ ...filled, auth_user_id: ctx.userId }, existing.id) });
    }
  }

  // Brand new vendor (gets the next vendor ID code automatically).
  return NextResponse.json({ vendor: await saveVendor({ ...fields, auth_user_id: ctx.userId }) });
});
