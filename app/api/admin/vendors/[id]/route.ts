/**
 * /api/admin/vendors/[id] — one vendor's profile and history.
 *
 * GET   → { vendor, bookings, assigned } where `assigned` lists stalls the
 *         admin assigned manually (no online booking).
 * PATCH → update any field incl. vendor ID code, type, notes, opt-in, active.
 */
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/server/supabase';
import { handle, HttpError, must, requireAdmin } from '@/lib/server/auth';
import { loadBookings } from '@/lib/server/bookings';
import type { Vendor } from '@/lib/types';
import { cleanVendorInput, saveVendor, VENDOR_SELECT } from '@/lib/server/vendors';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

export const GET = handle(async (req, { params }: Ctx) => {
  // Auth check and all three reads are independent → one round trip.
  const [, vendor, bookings, assigned] = await Promise.all([
    requireAdmin(req),
    supabase.from('vendors').select(VENDOR_SELECT).eq('id', params.id).maybeSingle().then(must),
    loadBookings({ vendorId: params.id }),
    supabase
      .from('event_stalls')
      .select('event_id, stall_no, price, events(name, start_date, end_date)')
      .eq('vendor_id', params.id)
      .is('booking_id', null)
      .eq('status', 'booked')
      .then(must),
  ]);
  if (!vendor) throw new HttpError(404, 'Vendor not found');
  return NextResponse.json({ vendor, bookings, assigned });
});

export const PATCH = handle(async (req, { params }: Ctx) => {
  await requireAdmin(req);
  const fields = cleanVendorInput((await req.json()) as Partial<Vendor>, { admin: true });
  if ('business_name' in fields && !fields.business_name) throw new HttpError(400, 'Business name is required');
  const vendor = await saveVendor(fields, params.id);
  if (!vendor) throw new HttpError(404, 'Vendor not found');
  return NextResponse.json({ vendor });
});
