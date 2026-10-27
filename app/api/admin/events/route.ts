/**
 * /api/admin/events — admin event list + create.
 *
 * GET  → every event (newest date first) with stall counts, plus the list of
 *        layouts for the "new event" form.
 * POST → create an event: { start_date, end_date, name, layout_id?,
 *        default_price, default_power_watts, status? }
 *        Event id = YYMMDD of start_date. end_date defaults to start_date.
 *
 * CONCEPT: creating an event copies EVERY stall from the master layout into
 * event_stalls with the default price/power. The admin then opens the event
 * map and clicks stalls to grey out (block) the ones not on offer this time,
 * or to change individual prices.
 */
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/server/supabase';
import { handle, HttpError, must, requireAdmin } from '@/lib/server/auth';
import { expireStaleHolds, listEventSummaries } from '@/lib/server/events';
import { eventIdFromDate } from '@/lib/util';
import type { EventRow } from '@/lib/types';

export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  await requireAdmin(req);
  await expireStaleHolds();
  const [events, layouts] = await Promise.all([
    supabase.from('events').select('*').order('start_date', { ascending: false }).then(must),
    supabase.from('layouts').select('id, name').order('name').then(must),
  ]);
  return NextResponse.json({ events: await listEventSummaries(events as EventRow[]), layouts });
});

export const POST = handle(async (req) => {
  await requireAdmin(req);
  const body = (await req.json()) as {
    start_date?: string;
    end_date?: string;
    name?: string;
    layout_id?: string;
    default_price?: number;
    default_power_watts?: number;
    status?: 'draft' | 'open';
  };

  // Dates: start is required; end defaults to start (one-day event).
  const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  if (!isDate(body.start_date)) throw new HttpError(400, 'Pick a start date');
  const startDate = body.start_date!;
  const endDate = isDate(body.end_date) ? body.end_date! : startDate;
  if (endDate < startDate) throw new HttpError(400, 'End date must be on or after the start date');
  const name = body.name?.trim();
  if (!name) throw new HttpError(400, 'Event name is required');
  const layoutId = body.layout_id || 'main';
  const price = Number(body.default_price ?? 0);
  const power = Math.round(Number(body.default_power_watts ?? 0));
  if (!(price >= 0) || !(power >= 0)) throw new HttpError(400, 'Price and power must be zero or more');

  // Event id is the START date as YYMMDD, so one event per start date.
  const id = eventIdFromDate(startDate);
  const clash = must(await supabase.from('events').select('id').eq('id', id).maybeSingle());
  if (clash) throw new HttpError(409, `An event already starts on that date (${id})`);

  const geometry = must(
    await supabase.from('layout_stalls').select('stall_no').eq('layout_id', layoutId),
  ) as { stall_no: string }[];
  if (geometry.length === 0) throw new HttpError(400, 'That layout has no stalls');

  must(
    await supabase.from('events').insert({
      id,
      name,
      start_date: startDate,
      end_date: endDate,
      layout_id: layoutId,
      status: body.status === 'open' ? 'open' : 'draft',
    }),
  );

  // Copy the master layout's stalls into this event.
  const { error } = await supabase.from('event_stalls').insert(
    geometry.map((g) => ({ event_id: id, stall_no: g.stall_no, price, power_watts: power, status: 'available' })),
  );
  if (error) {
    // No multi-statement transactions over PostgREST — undo the event manually.
    await supabase.from('events').delete().eq('id', id);
    throw new HttpError(500, error.message);
  }

  return NextResponse.json({ id });
});
