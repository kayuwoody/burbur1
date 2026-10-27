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

export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  await requireAdmin(req);
  await expireStaleHolds();

  const statusParam = new URL(req.url).searchParams.get('status');
  const statuses = statusParam ? statusParam.split(',').filter(Boolean) : undefined;

  const [bookings, all] = await Promise.all([
    loadBookings({ statuses }),
    supabase.from('bookings').select('status').then(must),
  ]);

  const counts: Record<string, number> = {};
  (all as { status: string }[]).forEach((b) => (counts[b.status] = (counts[b.status] ?? 0) + 1));

  return NextResponse.json({ bookings, counts });
});
