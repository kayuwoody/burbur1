/**
 * GET /api/admin/bookings?status=payment_submitted,pending_payment
 * All bookings (newest first), optionally filtered by status.
 * Also returns `counts` per status for the filter tabs.
 */
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/server/supabase';
import { handle, must, requireAdmin } from '@/lib/server/auth';
import { expireStaleHolds } from '@/lib/server/events';
import { loadBookings } from '@/lib/server/bookings';
import { bookingNeedsDocuments, syncBookingDocuments } from '@/lib/server/documents';

export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  // Login check and hold expiry don't depend on each other → run together.
  await Promise.all([requireAdmin(req), expireStaleHolds()]);

  const statusParam = new URL(req.url).searchParams.get('status');
  const statuses = statusParam ? statusParam.split(',').filter(Boolean) : undefined;

  let [bookings, all] = await Promise.all([
    loadBookings({ statuses }),
    supabase.from('bookings').select('status').then(must),
  ]);

  // Backfill invoices/receipts for bookings that predate invoicing.
  const stale = bookings.filter(bookingNeedsDocuments);
  if (stale.length) {
    for (const b of stale) await syncBookingDocuments(b.id).catch((e) => console.error('document sync failed', b.id, e));
    bookings = await loadBookings({ statuses });
  }

  const counts: Record<string, number> = {};
  (all as { status: string }[]).forEach((b) => (counts[b.status] = (counts[b.status] ?? 0) + 1));

  return NextResponse.json({ bookings, counts });
});
