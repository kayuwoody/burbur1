/**
 * PATCH /api/admin/events/[id]/stalls — bulk-edit selected stalls on the
 * admin event map.
 *
 * Body: {
 *   stall_nos: string[],                       // the stalls selected on the map
 *   price?: number, power_watts?: number,      // set on all selected stalls
 *   action?: 'block' | 'unblock' | 'assign' | 'unassign',
 *   vendor_id?: string                         // required for 'assign'
 * }
 *
 * CONCEPT, what each action may touch:
 *   block    available → blocked   (greyed out, not offered this event)
 *   unblock  blocked   → available
 *   assign   available/blocked → booked for a vendor, with no online booking
 *            (for clients who arranged a stall offline)
 *   unassign a manually assigned stall → available
 * Stalls tied to an online booking are never changed here. Their status
 * moves only via confirm/cancel on the Bookings screen, so the booking and the
 * map can't drift apart. Such stalls are returned in `skipped`.
 */
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/server/supabase';
import { handle, HttpError, must, requireAdmin } from '@/lib/server/auth';
import type { StallStatus } from '@/lib/types';

export const dynamic = 'force-dynamic';

type Row = { stall_no: string; status: StallStatus; booking_id: string | null };

export const PATCH = handle(async (req, { params }: { params: { id: string } }) => {
  await requireAdmin(req);
  const body = (await req.json()) as {
    stall_nos?: string[];
    price?: number;
    power_watts?: number;
    action?: 'block' | 'unblock' | 'assign' | 'unassign';
    vendor_id?: string;
  };

  const stallNos = Array.isArray(body.stall_nos) ? body.stall_nos.map(String) : [];
  if (stallNos.length === 0) throw new HttpError(400, 'Select at least one stall');

  // 1) Price / power: plain field updates, allowed on any stall. Existing
  //    bookings keep the price snapshotted in booking_items.
  const fields: Record<string, number> = {};
  if (body.price !== undefined && body.price !== null) {
    const p = Number(body.price);
    if (!(p >= 0)) throw new HttpError(400, 'Price must be zero or more');
    fields.price = p;
  }
  if (body.power_watts !== undefined && body.power_watts !== null) {
    const w = Math.round(Number(body.power_watts));
    if (!(w >= 0)) throw new HttpError(400, 'Power must be zero or more');
    fields.power_watts = w;
  }
  if (Object.keys(fields).length) {
    must(await supabase.from('event_stalls').update(fields).eq('event_id', params.id).in('stall_no', stallNos));
  }

  // 2) Status actions: decide per stall which ones are eligible.
  const skipped: string[] = [];
  if (body.action) {
    const rows = must(
      await supabase.from('event_stalls').select('stall_no, status, booking_id').eq('event_id', params.id).in('stall_no', stallNos),
    ) as Row[];

    let eligible: (r: Row) => boolean;
    let update: Record<string, unknown>;

    switch (body.action) {
      case 'block':
        eligible = (r) => r.status === 'available';
        update = { status: 'blocked' };
        break;
      case 'unblock':
        eligible = (r) => r.status === 'blocked';
        update = { status: 'available' };
        break;
      case 'assign': {
        if (!body.vendor_id) throw new HttpError(400, 'Choose a vendor to assign');
        const v = must(await supabase.from('vendors').select('id').eq('id', body.vendor_id).maybeSingle());
        if (!v) throw new HttpError(400, 'Vendor not found');
        eligible = (r) => r.status === 'available' || r.status === 'blocked';
        update = { status: 'booked', vendor_id: body.vendor_id, booking_id: null, hold_expires_at: null };
        break;
      }
      case 'unassign':
        eligible = (r) => r.status === 'booked' && !r.booking_id;
        update = { status: 'available', vendor_id: null };
        break;
      default:
        throw new HttpError(400, 'Unknown action');
    }

    const ok = rows.filter(eligible).map((r) => r.stall_no);
    skipped.push(...rows.filter((r) => !eligible(r)).map((r) => r.stall_no));
    if (ok.length) {
      must(await supabase.from('event_stalls').update(update).eq('event_id', params.id).in('stall_no', ok));
    }
  }

  return NextResponse.json({ ok: true, skipped });
});
