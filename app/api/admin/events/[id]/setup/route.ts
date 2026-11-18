/**
 * /api/admin/events/[id]/setup — setup forms for one event.
 *
 * GET  → every vendor with a form for this event: everyone holding or booked
 *        on a stall (rows created automatically) PLUS any vendor an admin
 *        added by hand (see POST), with their answers and form link.
 * POST { vendor_id } → create the form for a vendor picked by an admin
 *        (e.g. one added manually who isn't on the stall map), then return GET.
 * Returns full IC numbers: this is admin-only, for the work-pass list given
 * to the venue's security office.
 */
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/server/supabase';
import { handle, HttpError, must, requireAdmin } from '@/lib/server/auth';
import { expireStaleHolds } from '@/lib/server/events';
import { ensureSetupRows, powerTotal } from '@/lib/server/setup';
import { compareStallNo } from '@/lib/util';

export const dynamic = 'force-dynamic';

/** Build the vendor list for an event (shared by GET and POST). */
async function loadSetup(eventId: string) {
  const [, eventRes, stallsRes, extraRes] = await Promise.all([
    expireStaleHolds(),
    supabase.from('events').select('id, name, start_date, end_date, venue').eq('id', eventId).maybeSingle(),
    supabase
      .from('event_stalls')
      .select('stall_no, power_watts, status, vendor_id, vendor:vendors(id, vendor_code, business_name, contact_name, phone)')
      .eq('event_id', eventId)
      .in('status', ['held', 'booked'])
      .not('vendor_id', 'is', null),
    // Forms that exist for vendors who may not (or no longer) be on a stall.
    supabase
      .from('vendor_event_setup')
      .select('vendor:vendors(id, vendor_code, business_name, contact_name, phone)')
      .eq('event_id', eventId),
  ]);
  const event = must(eventRes);
  if (!event) throw new HttpError(404, 'Event not found');
  type S = {
    stall_no: string;
    power_watts: number;
    vendor_id: string;
    vendor: { id: string; vendor_code: string; business_name: string; contact_name: string | null; phone: string | null };
  };
  const stalls = must(stallsRes) as unknown as S[];

  // One entry per vendor, with their stalls and allocated power.
  const byVendor = new Map<string, { vendor: S['vendor']; stalls: string[]; allocated_watts: number }>();
  for (const s of stalls) {
    const v = byVendor.get(s.vendor_id) ?? { vendor: s.vendor, stalls: [], allocated_watts: 0 };
    v.stalls.push(s.stall_no);
    v.allocated_watts += Number(s.power_watts || 0);
    byVendor.set(s.vendor_id, v);
  }

  // Vendors added by hand (no stall here): include them with no stalls.
  for (const r of must(extraRes) as unknown as { vendor: S['vendor'] }[]) {
    if (r.vendor && !byVendor.has(r.vendor.id)) byVendor.set(r.vendor.id, { vendor: r.vendor, stalls: [], allocated_watts: 0 });
  }

  const rows = await ensureSetupRows([...byVendor.keys()].map((vendor_id) => ({ event_id: eventId, vendor_id })));
  const vendors = [...byVendor.values()]
    .map((v) => {
      v.stalls.sort(compareStallNo);
      const r = rows.get(`${eventId}:${v.vendor.id}`)!;
      return {
        ...v,
        access_token: r.access_token,
        submitted_at: r.submitted_at,
        updated_at: r.updated_at,
        workers: r.workers,
        extra_power: r.extra_power,
        power_items: r.power_items,
        power_total: powerTotal(r.power_items),
      };
    })
    // Stall order first; hand-added vendors (no stall) last, by name.
    .sort((a, b) =>
      a.stalls.length && b.stalls.length
        ? compareStallNo(a.stalls[0], b.stalls[0])
        : a.stalls.length
          ? -1
          : b.stalls.length
            ? 1
            : a.vendor.business_name.localeCompare(b.vendor.business_name),
    );

  return { event, vendors };
}

export const GET = handle(async (req, { params }: { params: { id: string } }) => {
  await requireAdmin(req);
  return NextResponse.json(await loadSetup(params.id));
});

export const POST = handle(async (req, { params }: { params: { id: string } }) => {
  await requireAdmin(req);
  const { vendor_id } = (await req.json()) as { vendor_id?: string };
  if (!vendor_id) throw new HttpError(400, 'Choose a vendor');
  const vendor = must(await supabase.from('vendors').select('id').eq('id', vendor_id).maybeSingle());
  if (!vendor) throw new HttpError(404, 'Vendor not found');
  await ensureSetupRows([{ event_id: params.id, vendor_id }]);
  return NextResponse.json(await loadSetup(params.id));
});
