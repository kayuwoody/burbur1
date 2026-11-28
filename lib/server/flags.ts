/**
 * lib/server/flags.ts — admin flags on vendors (014_vendor_flags.sql).
 *
 *   interests  – event ids the vendor has said they're interested in
 *                (table vendor_event_interest, one row per vendor+event)
 *   follow_up  – a to-do flag on the vendor, with an optional note and the
 *                time it was set (columns on vendors)
 *
 * CONCEPT: one shape (VendorFlags) used by the Notify page and the vendor
 * details page, so both always show and edit the same thing.
 */
import { supabase } from './supabase';
import { HttpError, must } from './auth';

export type VendorFlags = {
  interests: string[];
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

/** One vendor's flags (interests + follow-up), read in parallel. */
export async function loadVendorFlags(vendorId: string): Promise<VendorFlags> {
  const [interests, vendor] = await Promise.all([
    loadInterests([vendorId]),
    supabase.from('vendors').select('follow_up, follow_up_note, follow_up_at').eq('id', vendorId).maybeSingle().then(must),
  ]);
  if (!vendor) throw new HttpError(404, 'Vendor not found');
  const v = vendor as { follow_up: boolean; follow_up_note: string | null; follow_up_at: string | null };
  return { interests: interests[vendorId] ?? [], ...v };
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
