/**
 * /api/admin/notify — WhatsApp "send links" for announcing an event.
 *
 * GET  ?event_ids=A,B → opted-in active vendors with phones, plus when each
 *                      was last messaged about EACH of those events
 *                      (`sent: { [event_id]: timestamp }`).
 *                      (?event_id=A still works for a single event.)
 * POST { event_ids: [A, B], vendor_id, message } → record that one message
 *                      covering those events was sent (one log row per event,
 *                      so each event keeps its own "who's been told" list).
 *
 * CONCEPT: we don't send WhatsApp messages from the server (that needs the
 * paid Business API). The admin screen opens a wa.me link per vendor with
 * the message pre-typed, the admin taps Send in their own WhatsApp
 * Business app, and we log it here so nobody gets messaged twice.
 * Swapping in the official API later only means replacing that click with a
 * server call in this route.
 */
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/server/supabase';
import { handle, HttpError, must, requireAdmin } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  await requireAdmin(req);
  // Which events we're announcing: comma-separated list (or a single id).
  const params = new URL(req.url).searchParams;
  const eventIds = (params.get('event_ids') ?? params.get('event_id') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  // Vendor list and send history don't depend on each other: fetch both at once.
  const [vendorsRes, logsRes] = await Promise.all([
    supabase
      .from('vendors')
      .select('id, vendor_code, business_name, contact_name, phone, vendor_type_id, offerings, vendor_type:vendor_types(name)')
      .eq('is_active', true)
      .eq('whatsapp_opt_in', true)
      .not('phone', 'is', null)
      .order('business_name'),
    eventIds.length
      ? supabase
          .from('notification_log')
          .select('event_id, vendor_id, created_at')
          .in('event_id', eventIds)
          .order('created_at', { ascending: true })
      : Promise.resolve({ data: [], error: null }),
  ]);
  const vendors = must(vendorsRes) as { id: string }[];
  const logs = must(logsRes) as { event_id: string; vendor_id: string; created_at: string }[];

  // Latest send time per vendor, per event (logs are oldest-first, so the
  // last write wins).
  const sent: Record<string, Record<string, string>> = {};
  logs.forEach((l) => ((sent[l.vendor_id] ??= {})[l.event_id] = l.created_at));

  return NextResponse.json({
    vendors: vendors.map((v) => ({ ...v, sent: sent[v.id] ?? {} })),
  });
});

export const POST = handle(async (req) => {
  await requireAdmin(req);
  const body = (await req.json()) as {
    event_ids?: string[];
    event_id?: string; // older single-event form
    vendor_id?: string;
    message?: string;
  };
  const { vendor_id, message } = body;
  if (!vendor_id || !message) throw new HttpError(400, 'vendor_id and message are required');
  const eventIds = [...new Set(body.event_ids ?? (body.event_id ? [body.event_id] : []))];

  // One row per event the message covered (or one event-less row), all with
  // the same text, so each event's "Not yet sent" list stays accurate.
  const rows = must(
    await supabase
      .from('notification_log')
      .insert((eventIds.length ? eventIds : [null]).map((event_id) => ({ event_id, vendor_id, message })))
      .select('created_at'),
  ) as { created_at: string }[];
  return NextResponse.json({ ok: true, sent_at: rows[0]?.created_at ?? new Date().toISOString() });
});
