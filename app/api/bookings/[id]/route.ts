/**
 * GET /api/bookings/[id] — one booking plus the bank details to pay into.
 * Vendors can only read their own bookings; admins can read any.
 */
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/server/supabase';
import { handle, HttpError, must, requireUser } from '@/lib/server/auth';
import { expireStaleHolds } from '@/lib/server/events';
import { loadBookings } from '@/lib/server/bookings';
import type { Settings } from '@/lib/types';

export const dynamic = 'force-dynamic';

export const GET = handle(async (req, { params }: { params: { id: string } }) => {
  // Trip 1: login check ‖ hold expiry ‖ bank details (all independent).
  const [ctx, , settingsRes] = await Promise.all([
    requireUser(req),
    expireStaleHolds(),
    supabase.from('settings').select('hold_hours, bank_name, bank_account_name, bank_account_no, payment_note').eq('id', 1).single(),
  ]);
  const settings = must(settingsRes) as Settings;

  // Trip 2: the booking itself (after expiry, so its status is current).
  const [booking] = await loadBookings({ id: params.id });
  if (!booking) throw new HttpError(404, 'Booking not found');
  if (!ctx.isAdmin && booking.vendor_id !== ctx.vendor?.id) throw new HttpError(404, 'Booking not found');

  return NextResponse.json({ booking, payment: settings });
});
