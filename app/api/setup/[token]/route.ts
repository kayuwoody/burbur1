/**
 * /api/setup/[token] — the vendor setup form behind its secret link.
 *
 * GET → what the form needs: event, vendor name, their stalls, saved answers.
 * PUT → save { workers, extra_power, power_items } (see cleanSetupInput).
 *
 * No login: the unguessable token IS the access check, so the link can be
 * sent over WhatsApp. Answers can be changed until the event has ended.
 */
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/server/supabase';
import { handle, HttpError, must } from '@/lib/server/auth';
import { cleanSetupInput, type SetupRow } from '@/lib/server/setup';
import { compareStallNo, todayMYT } from '@/lib/util';

export const dynamic = 'force-dynamic';

type Ctx = { params: { token: string } };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Look up the form row + its event and vendor; 404 for unknown tokens. */
async function load(token: string) {
  if (!UUID.test(token)) throw new HttpError(404, 'This form link is not valid');
  const row = must(
    await supabase
      .from('vendor_event_setup')
      .select('*, event:events(id, name, start_date, end_date, venue), vendor:vendors(business_name)')
      .eq('access_token', token)
      .maybeSingle(),
  ) as (SetupRow & { event: { id: string; name: string; start_date: string; end_date: string; venue: string | null }; vendor: { business_name: string } }) | null;
  if (!row) throw new HttpError(404, 'This form link is not valid');
  return row;
}

export const GET = handle(async (_req, { params }: Ctx) => {
  const row = await load(params.token);
  // The vendor's stalls in this event (held or booked).
  const stalls = must(
    await supabase
      .from('event_stalls')
      .select('stall_no')
      .eq('event_id', row.event_id)
      .eq('vendor_id', row.vendor_id)
      .in('status', ['held', 'booked']),
  ) as { stall_no: string }[];
  return NextResponse.json({
    event: row.event,
    vendor_name: row.vendor.business_name,
    stalls: stalls.map((s) => s.stall_no).sort(compareStallNo),
    workers: row.workers,
    extra_power: row.extra_power,
    power_items: row.power_items,
    submitted_at: row.submitted_at,
    updated_at: row.updated_at,
    locked: row.event.end_date < todayMYT(),
  });
});

export const PUT = handle(async (req, { params }: Ctx) => {
  const row = await load(params.token);
  if (row.event.end_date < todayMYT()) throw new HttpError(409, 'This event has ended, so the form can no longer be changed');
  const clean = cleanSetupInput(await req.json());
  const now = new Date().toISOString();
  must(
    await supabase
      .from('vendor_event_setup')
      .update({ ...clean, updated_at: now, submitted_at: row.submitted_at ?? now })
      .eq('id', row.id),
  );
  return NextResponse.json({ ok: true, updated_at: now });
});
