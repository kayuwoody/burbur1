/**
 * lib/server/flags.ts — admin flags on vendors (014_vendor_flags.sql).
 *
 *   interests  – event ids the vendor has said they're interested in
 *                (table vendor_event_interest, one row per vendor+event)
 *   follow_up  – a to-do flag on the vendor, with an optional note and the
 *                time it was set (columns on vendors)
 *   vendor_of  – events where the vendor actually has a stall: booked online
 *                (held while unpaid, booked once confirmed) or assigned by an
 *                admin. NOT stored: worked out live from event_stalls, so it
 *                appears on booking and disappears on cancel/expiry by itself.
 *
 * CONCEPT: one shape (VendorFlags) used by the Notify page and the vendor
 * details page, so both always show and edit the same thing.
 */
import { supabase } from './supabase';
import { HttpError, must } from './auth';
import { compareStallNo } from '../util';

/** One event the vendor has stalls at (derived from event_stalls). */
export type VendorOf = {
  event_id: string;
  /** 'booked' = confirmed / assigned; 'held' = online booking awaiting payment. */
  status: 'booked' | 'held';
  stalls: string[];
};

export type VendorFlags = {
  interests: string[];
  vendor_of: VendorOf[];
  follow_up: boolean;
  follow_up_note: string | null;
  follow_up_at: string | null;
};

/**
 * Interest event ids for many vendors at once (one query), as a map
 * vendorId → [eventId, …]. Vendors with none are simply absent.
 */
export async function loadInterests(vendorIds?: string[]): Promise<Record<string, string[]>> {
  let q = supabase.from('vendor_event_interest').select('vendor_id, event_id').order('created_at');
  if (vendorIds) q = q.in('vendor_id', vendorIds);
  const rows = must(await q) as { vendor_id: string; event_id: string }[];
  const map: Record<string, string[]> = {};
  rows.forEach((r) => (map[r.vendor_id] ??= []).push(r.event_id));
  return map;
}

/**
 * Which events each vendor has stalls at, as vendorId → [VendorOf…]. One
 * query over event_stalls. A vendor with several stalls at one event gets
 * one entry listing them; 'booked' wins over 'held' if they have both.
 * `openOnly` skips closed (past) events: the Notify page only needs
 * upcoming ones, and it keeps the query small as events accumulate.
 */
export async function loadVendorOf(vendorIds?: string[], openOnly = false): Promise<Record<string, VendorOf[]>> {
  let q = supabase
    .from('event_stalls')
    // events!inner lets us filter stalls by their event's status.
    .select('vendor_id, event_id, stall_no, status, events!inner(status)')
    .in('status', ['held', 'booked'])
    .not('vendor_id', 'is', null);
  if (vendorIds) q = q.in('vendor_id', vendorIds);
  if (openOnly) q = q.neq('events.status', 'closed');
  const rows = must(await q) as { vendor_id: string; event_id: string; stall_no: string; status: 'held' | 'booked' }[];
  const map: Record<string, VendorOf[]> = {};
  rows.forEach((r) => {
    const list = (map[r.vendor_id] ??= []);
    let e = list.find((x) => x.event_id === r.event_id);
    if (!e) list.push((e = { event_id: r.event_id, status: r.status, stalls: [] }));
    e.stalls.push(r.stall_no);
    if (r.status === 'booked') e.status = 'booked';
  });
  Object.values(map).forEach((list) => list.forEach((e) => e.stalls.sort(compareStallNo)));
  return map;
}

/** One vendor's flags (interests, stalls held, follow-up), read in parallel. */
export async function loadVendorFlags(vendorId: string): Promise<VendorFlags> {
  const [interests, vendorOf, vendor] = await Promise.all([
    loadInterests([vendorId]),
    loadVendorOf([vendorId]),
    supabase.from('vendors').select('follow_up, follow_up_note, follow_up_at').eq('id', vendorId).maybeSingle().then(must),
  ]);
  if (!vendor) throw new HttpError(404, 'Vendor not found');
  const v = vendor as { follow_up: boolean; follow_up_note: string | null; follow_up_at: string | null };
  return { interests: interests[vendorId] ?? [], vendor_of: vendorOf[vendorId] ?? [], ...v };
}

/**
 * Apply a change and return the vendor's flags afterwards (so the page
 * updates without a second request).
 *   { interest: { event_id, on } }        → add/remove interest in one event
 *   { follow_up: true|false, note? }       → set/clear the follow-up flag
 * Both may be sent together.
 */
export async function updateVendorFlags(
  vendorId: string,
  change: { interest?: { event_id?: string; on?: boolean }; follow_up?: boolean; note?: string | null },
): Promise<VendorFlags> {
  const jobs: PromiseLike<unknown>[] = [];

  if (change.interest) {
    const { event_id, on } = change.interest;
    if (!event_id) throw new HttpError(400, 'event_id is required');
    jobs.push(
      on
        ? // upsert: ticking twice is harmless
          supabase
            .from('vendor_event_interest')
            .upsert({ vendor_id: vendorId, event_id }, { onConflict: 'vendor_id,event_id', ignoreDuplicates: true })
            .then(must)
        : supabase.from('vendor_event_interest').delete().eq('vendor_id', vendorId).eq('event_id', event_id).then(must),
    );
  }

  if (typeof change.follow_up === 'boolean') {
    const patch = change.follow_up
      ? { follow_up: true, follow_up_note: change.note?.trim().slice(0, 300) || null, follow_up_at: new Date().toISOString() }
      : { follow_up: false, follow_up_note: null, follow_up_at: null };
    jobs.push(supabase.from('vendors').update(patch).eq('id', vendorId).then(must));
  }

  if (!jobs.length) throw new HttpError(400, 'Nothing to change');
  await Promise.all(jobs);
  return loadVendorFlags(vendorId);
}
