/**
 * /api/me — who am I, and my vendor profile.
 *
 * GET → { user, vendor, isAdmin }  (pages use this to decide where to send you)
 * PUT → create or update the caller's own vendor profile.
 */
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/server/supabase';
import { handle, HttpError, must, requireUser } from '@/lib/server/auth';
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

  const business_name = input.business_name?.trim();
  const phone = input.phone?.trim();
  if (!business_name) throw new HttpError(400, 'Business name is required');
  if (!phone) throw new HttpError(400, 'WhatsApp number is required');

  // Only these fields are vendor-editable; notes/is_active are admin-only.
  const fields = {
    business_name,
    phone,
    contact_name: input.contact_name?.trim() || null,
    category: input.category?.trim() || null,
    whatsapp_opt_in: input.whatsapp_opt_in ?? true,
    email: ctx.email,
  };

  // Already has a profile → plain update.
  if (ctx.vendor) {
    const vendor = must(await supabase.from('vendors').update(fields).eq('id', ctx.vendor.id).select().single());
    return NextResponse.json({ vendor });
  }

  // Admin-created row waiting for this email → claim it.
  if (ctx.email) {
    const existing = must(
      await supabase
        .from('vendors')
        .select('id')
        .ilike('email', ctx.email)
        .is('auth_user_id', null)
        .limit(1)
        .maybeSingle(),
    ) as { id: string } | null;
    if (existing) {
      const vendor = must(
        await supabase
          .from('vendors')
          .update({ ...fields, auth_user_id: ctx.userId })
          .eq('id', existing.id)
          .select()
          .single(),
      );
      return NextResponse.json({ vendor });
    }
  }

  // Brand new vendor.
  const vendor = must(
    await supabase
      .from('vendors')
      .insert({ ...fields, auth_user_id: ctx.userId })
      .select()
      .single(),
  );
  return NextResponse.json({ vendor });
});
