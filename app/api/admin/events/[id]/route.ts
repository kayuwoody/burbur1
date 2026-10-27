/**
 * /api/admin/events/[id] — one event, admin view.
 *
 * GET    → event + layout + every stall incl. vendor name & booking id
 * PATCH  → update { name?, status?, notes?, end_date? }
 *          (start date is fixed because it is the event id)
 * DELETE → remove the event; refused if any booking references it.
 */
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/server/supabase';
import { handle, HttpError, must, requireAdmin } from '@/lib/server/auth';
import { loadEventDetail } from '@/lib/server/events';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

export const GET = handle(async (req, { params }: Ctx) => {
  await requireAdmin(req);
  return NextResponse.json(await loadEventDetail(params.id, 'admin'));
});

export const PATCH = handle(async (req, { params }: Ctx) => {
  await requireAdmin(req);
  const body = (await req.json()) as { name?: string; status?: string; notes?: string | null; end_date?: string };

  // Build the update from only the fields that were sent.
  const update: Record<string, unknown> = {};
  if (body.name !== undefined) {
    if (!body.name.trim()) throw new HttpError(400, 'Event name is required');
    update.name = body.name.trim();
  }
  if (body.status !== undefined) {
    if (!['draft', 'open', 'closed'].includes(body.status)) throw new HttpError(400, 'Invalid status');
    update.status = body.status;
  }
  if (body.notes !== undefined) update.notes = body.notes?.trim() || null;
  if (body.end_date !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.end_date)) throw new HttpError(400, 'Invalid end date');
    const ev = must(await supabase.from('events').select('start_date').eq('id', params.id).maybeSingle()) as
      | { start_date: string }
      | null;
    if (!ev) throw new HttpError(404, 'Event not found');
    if (body.end_date < ev.start_date) throw new HttpError(400, 'End date must be on or after the start date');
    update.end_date = body.end_date;
  }

  const event = must(await supabase.from('events').update(update).eq('id', params.id).select().maybeSingle());
  if (!event) throw new HttpError(404, 'Event not found');
  return NextResponse.json({ event });
});

export const DELETE = handle(async (req, { params }: Ctx) => {
  await requireAdmin(req);
  // Booking history must survive, so events with bookings can only be closed.
  const used = must(
    await supabase.from('booking_items').select('booking_id').eq('event_id', params.id).limit(1),
  ) as unknown[];
  if (used.length) throw new HttpError(409, 'This event has bookings. Close it instead of deleting.');
  must(await supabase.from('notification_log').delete().eq('event_id', params.id));
  must(await supabase.from('events').delete().eq('id', params.id));
  return NextResponse.json({ ok: true });
});
