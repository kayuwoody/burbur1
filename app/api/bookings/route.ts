/**
 * /api/bookings — the vendor's own bookings.
 *
 * GET  → list my bookings (newest first)
 * POST → check out the cart: { items: [{ event_id, stall_no }, …] }
 *        Holds every stall atomically or none at all (see SQL create_booking).
 *        409 with `unavailable: [{event_id, stall_no}]` if any were taken.
 */
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/server/supabase';
import { handle, HttpError, requireVendor } from '@/lib/server/auth';
import { expireStaleHolds } from '@/lib/server/events';
import { loadBookings } from '@/lib/server/bookings';

export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  const [ctx] = await Promise.all([requireVendor(req), expireStaleHolds()]);
  return NextResponse.json({ bookings: await loadBookings({ vendorId: ctx.vendor.id }) });
});

export const POST = handle(async (req) => {
  const ctx = await requireVendor(req);
  const { items } = (await req.json()) as { items?: { event_id: string; stall_no: string }[] };

  if (!Array.isArray(items) || items.length === 0) throw new HttpError(400, 'Your cart is empty');
  // Only pass through the two keys the SQL function expects.
  const clean = items.map((i) => ({ event_id: String(i.event_id), stall_no: String(i.stall_no) }));

  const { data, error } = await supabase.rpc('create_booking', {
    p_vendor_id: ctx.vendor.id,
    p_items: clean,
  });

  if (error) {
    // The SQL function raises 'STALL_UNAVAILABLE:261115/3A,261115/5'.
    const m = /STALL_UNAVAILABLE:(\S+)/.exec(error.message);
    if (m) {
      const unavailable = m[1].split(',').map((s) => {
        const [event_id, stall_no] = s.split('/');
        return { event_id, stall_no };
      });
      throw new HttpError(409, 'Some stalls are no longer available', { unavailable });
    }
    if (error.message.includes('EMPTY_CART')) throw new HttpError(400, 'Your cart is empty');
    throw new HttpError(500, error.message);
  }

  return NextResponse.json({ booking_id: data as string });
});
