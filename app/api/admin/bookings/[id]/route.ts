/**
 * PATCH /api/admin/bookings/[id] — { action: 'confirm' | 'cancel', note? }
 *
 * confirm → payment verified; stalls become 'booked'.
 * cancel  → reject/cancel; stalls released for others to book.
 * Both run in one SQL function so booking + stalls change together.
 */
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/server/supabase';
import { handle, HttpError, requireAdmin } from '@/lib/server/auth';
import { loadBookings } from '@/lib/server/bookings';
import { syncBookingDocuments } from '@/lib/server/documents';

export const dynamic = 'force-dynamic';

export const PATCH = handle(async (req, { params }: { params: { id: string } }) => {
  await requireAdmin(req);
  const { action, note } = (await req.json()) as { action?: string; note?: string };
  if (action !== 'confirm' && action !== 'cancel') throw new HttpError(400, 'Unknown action');

  const { error } = await supabase.rpc('admin_booking_action', {
    p_booking_id: params.id,
    p_action: action,
    p_note: note?.trim() || null,
  });
  if (error) {
    if (error.message.includes('BOOKING_NOT_FOUND')) throw new HttpError(404, 'Booking not found');
    const m = /INVALID_STATE:(\w+)/.exec(error.message);
    if (m) throw new HttpError(409, `Booking is already ${m[1].replace('_', ' ')}`);
    throw new HttpError(500, error.message);
  }

  // Confirmed → issue the receipt(s) (and invoice if somehow missing).
  // Cancelled → documents were voided by the SQL function.
  if (action === 'confirm') await syncBookingDocuments(params.id);
  const [booking] = await loadBookings({ id: params.id });
  return NextResponse.json({ booking });
});
