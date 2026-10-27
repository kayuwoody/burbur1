/**
 * lib/server/bookings.ts — load bookings with their line items, event names
 * and vendor, in the shape the pages expect (lib/types Booking).
 */
import { supabase } from './supabase';
import { must } from './auth';
import type { Booking } from '../types';

/** Columns pulled for every booking, using PostgREST embedded joins. */
const SELECT = `
  *,
  items:booking_items(booking_id, event_id, stall_no, price, event:events(id, name, start_date, end_date)),
  vendor:vendors(id, business_name, contact_name, phone, email),
  docs:documents(id, kind, number, event_id, access_token, voided_at, issued_on)
`;

/**
 * Fetch bookings, optionally filtered.
 * CONCEPT: one query builder for "my bookings", "admin list" and
 * "single booking" so the response shape is identical everywhere.
 */
export async function loadBookings(filter: {
  id?: string;
  vendorId?: string;
  statuses?: string[];
  limit?: number;
}): Promise<Booking[]> {
  let q = supabase.from('bookings').select(SELECT).order('created_at', { ascending: false });
  if (filter.id) q = q.eq('id', filter.id);
  if (filter.vendorId) q = q.eq('vendor_id', filter.vendorId);
  if (filter.statuses?.length) q = q.in('status', filter.statuses);
  q = q.limit(filter.limit ?? 200);

  const rows = must(await q) as unknown as Booking[];
  // numeric columns come back as strings from PostgREST — coerce once here.
  return rows.map((b) => ({
    ...b,
    total: Number(b.total),
    items: (b.items ?? []).map((i) => ({ ...i, price: Number(i.price) })),
  }));
}
