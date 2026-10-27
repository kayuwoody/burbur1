/**
 * lib/server/events.ts — shared server logic for loading events and maps.
 *
 * Used by both the vendor-facing and admin-facing routes. The difference is
 * only in how much is revealed: admins see which vendor holds each stall,
 * vendors only see "available / unavailable / mine".
 */
import { supabase } from './supabase';
import { HttpError, must } from './auth';
import { compareStallNo } from '../util';
import type { EventDetail, EventRow, EventSummary, Layout, MapStall, StallStatus } from '../types';

/** Who is looking at a map: an admin, or a vendor (possibly logged out). */
export type Viewer = 'admin' | { vendorId: string | null };

/** Release any unpaid holds past their deadline (see SQL expire_stale_holds). */
export async function expireStaleHolds(): Promise<void> {
  const { error } = await supabase.rpc('expire_stale_holds');
  if (error) console.error('expire_stale_holds failed', error);
}

/**
 * List events with stall counts for the event cards.
 * CONCEPT: one query for events + one for all their stalls, aggregated in JS.
 * Event counts are small (tens of events × ~34 stalls), so this is cheap.
 */
export async function listEventSummaries(events: EventRow[]): Promise<EventSummary[]> {
  if (events.length === 0) return [];
  const stalls = must(
    await supabase
      .from('event_stalls')
      .select('event_id, status, price')
      .in('event_id', events.map((e) => e.id)),
  ) as { event_id: string; status: StallStatus; price: number }[];

  return events.map((e) => {
    const mine = stalls.filter((s) => s.event_id === e.id);
    const counts = { total: mine.length, available: 0, held: 0, booked: 0, blocked: 0 };
    mine.forEach((s) => counts[s.status]++);
    const prices = mine.filter((s) => s.status === 'available').map((s) => Number(s.price));
    return { ...e, counts, min_price: prices.length ? Math.min(...prices) : null };
  });
}

/**
 * Load an event with its layout and every stall's geometry + status.
 *
 * @param viewerIn 'admin' → include vendor names/ids.
 *                 { vendorId } → hide other vendors; flag the viewer's own stalls.
 *                 May be a Promise, so the caller's login check can run in
 *                 parallel with these queries instead of before them.
 *
 * SPEED: the database is far enough away that each sequential round trip
 * is noticeable, so independent calls are grouped with Promise.all:
 *   trip 1: expire stale holds  ‖  fetch event row  ‖  (caller's auth)
 *   trip 2: layout  ‖  stall geometry  ‖  event stalls
 */
export async function loadEventDetail(
  eventId: string,
  viewerIn: Viewer | Promise<Viewer>,
): Promise<EventDetail> {
  // Expiry must finish before we read stall statuses (trip 2), but the event
  // row doesn't depend on it, so they run together.
  const [, eventRes, viewer] = await Promise.all([
    expireStaleHolds(),
    supabase.from('events').select('*').eq('id', eventId).maybeSingle(),
    viewerIn,
  ]);
  const event = must(eventRes) as EventRow | null;
  if (!event) throw new HttpError(404, 'Event not found');
  // Vendors may only see events that are open (or closed, for history).
  if (viewer !== 'admin' && event.status === 'draft') throw new HttpError(404, 'Event not found');

  // Layout, its stall geometry, and this event's stall rows — in parallel.
  const [layout, geometry, rows] = await Promise.all([
    supabase.from('layouts').select('*').eq('id', event.layout_id).single().then(must),
    supabase.from('layout_stalls').select('stall_no, x, y, w, h').eq('layout_id', event.layout_id).then(must),
    supabase
      .from('event_stalls')
      .select('stall_no, price, power_watts, status, vendor_id, booking_id, hold_expires_at, vendors(business_name)')
      .eq('event_id', eventId)
      .then(must),
  ]);

  type Row = {
    stall_no: string;
    price: number;
    power_watts: number;
    status: StallStatus;
    vendor_id: string | null;
    booking_id: string | null;
    hold_expires_at: string | null;
    vendors: { business_name: string } | null;
  };
  const byNo = new Map((rows as unknown as Row[]).map((r) => [r.stall_no, r]));

  // Merge: only stalls present in BOTH the layout and this event are drawn.
  const stalls: MapStall[] = (geometry as { stall_no: string; x: number; y: number; w: number; h: number }[])
    .filter((g) => byNo.has(g.stall_no))
    .map((g) => {
      const r = byNo.get(g.stall_no)!;
      const base: MapStall = {
        ...g,
        price: Number(r.price),
        power_watts: r.power_watts,
        status: r.status,
      };
      if (viewer === 'admin') {
        return {
          ...base,
          vendor_id: r.vendor_id,
          vendor_name: r.vendors?.business_name ?? null,
          booking_id: r.booking_id,
          hold_expires_at: r.hold_expires_at,
        };
      }
      return { ...base, mine: !!viewer.vendorId && r.vendor_id === viewer.vendorId };
    })
    .sort((a, b) => compareStallNo(a.stall_no, b.stall_no));

  return { event, layout: layout as Layout, stalls };
}
