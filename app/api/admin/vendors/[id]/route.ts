/**
 * /api/admin/vendors/[id] — one vendor's profile and history.
 *
 * GET   → { vendor, bookings, assigned } where `assigned` lists stalls the
 *         admin assigned manually (no online booking).
 * PATCH → update profile fields, notes, opt-in, active flag.
 */
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/server/supabase';
import { handle, HttpError, must, requireAdmin } from '@/lib/server/auth';
import { loadBookings } from '@/lib/server/bookings';
import type { Vendor } from '@/lib/types';
import { vendorFields } from '@/lib/server/vendors';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

export const GET = handle(async (req, { params }: Ctx) => {
  await requireAdmin(req);
  const vendor = must(await supabase.from('vendors').select('*').eq('id', params.id).maybeSingle());
  if (!vendor) throw new HttpError(404, 'Vendor not found');

  const [bookings, assigned] = await Promise.all([
    loadBookings({ vendorId: params.id }),
    supabase
      .from('event_stalls')
      .select('event_id, stall_no, price, events(name, start_date, end_date)')
      .eq('vendor_id', params.id)
      .is('booking_id', null)
      .eq('status', 'booked')
      .then(must),
  ]);
  return NextResponse.json({ vendor, bookings, assigned });
});

export const PATCH = handle(async (req, { params }: Ctx) => {
  await requireAdmin(req);
  const fields = vendorFields((await req.json()) as Partial<Vendor>);
  if ('business_name' in fields && !fields.business_name) throw new HttpError(400, 'Business name is required');
  const vendor = must(await supabase.from('vendors').update(fields).eq('id', params.id).select().maybeSingle());
  if (!vendor) throw new HttpError(404, 'Vendor not found');
  return NextResponse.json({ vendor });
});
