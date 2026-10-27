/**
 * /api/admin/vendors — vendor (client) management.
 *
 * GET  ?q=search → all vendors matching name / contact / phone / email
 * POST           → create a vendor record (no login needed; when the vendor
 *                  later signs up with the same email they're linked to it)
 */
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/server/supabase';
import { handle, HttpError, must, requireAdmin } from '@/lib/server/auth';
import { vendorFields } from '@/lib/server/vendors';
import type { Vendor } from '@/lib/types';

export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  await requireAdmin(req);
  const q = new URL(req.url).searchParams.get('q')?.trim();

  let query = supabase.from('vendors').select('*').order('business_name');
  if (q) {
    // Strip characters that have meaning in PostgREST's or() syntax.
    const s = q.replace(/[,()%*]/g, ' ');
    query = query.or(
      ['business_name', 'contact_name', 'phone', 'email', 'category'].map((c) => `${c}.ilike.%${s}%`).join(','),
    );
  }
  return NextResponse.json({ vendors: must(await query) });
});

export const POST = handle(async (req) => {
  await requireAdmin(req);
  const fields = vendorFields((await req.json()) as Partial<Vendor>);
  if (!fields.business_name) throw new HttpError(400, 'Business name is required');
  const vendor = must(await supabase.from('vendors').insert(fields).select().single());
  return NextResponse.json({ vendor });
});
