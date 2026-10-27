/**
 * /api/admin/vendors — vendor (client) management.
 *
 * GET  ?q=search&type=<id|none> → vendors matching vendor ID, name, contact,
 *                  phones, email, offerings or address; optionally one type
 * POST           → create a vendor record (no login needed; when the vendor
 *                  later signs up with the same email they're linked to it)
 */
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/server/supabase';
import { handle, HttpError, must, requireAdmin } from '@/lib/server/auth';
import { cleanVendorInput, saveVendor, VENDOR_SELECT } from '@/lib/server/vendors';
import type { Vendor } from '@/lib/types';

export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  await requireAdmin(req);
  const params = new URL(req.url).searchParams;
  const q = params.get('q')?.trim();
  const type = params.get('type');

  let query = supabase.from('vendors').select(VENDOR_SELECT).order('business_name');
  if (q) {
    // Strip characters that have meaning in PostgREST's or() syntax.
    const s = q.replace(/[,()%*]/g, ' ');
    const cols = ['vendor_code', 'business_name', 'contact_name', 'phone', 'email', 'offerings', 'address'];
    query = query.or(cols.map((c) => `${c}.ilike.%${s}%`).join(','));
  }
  // ?type=3 → that type only; ?type=none → vendors with no type set.
  if (type === 'none') query = query.is('vendor_type_id', null);
  else if (type) query = query.eq('vendor_type_id', Number(type));

  return NextResponse.json({ vendors: must(await query) });
});

export const POST = handle(async (req) => {
  await requireAdmin(req);
  const fields = cleanVendorInput((await req.json()) as Partial<Vendor>, { admin: true });
  if (!fields.business_name) throw new HttpError(400, 'Business name is required');
  // vendor_code left out → the database assigns the next 'V0001'-style code.
  return NextResponse.json({ vendor: await saveVendor(fields) });
});
