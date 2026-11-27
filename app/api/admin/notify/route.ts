/**
 * /api/admin/notify — WhatsApp announcement log for the Notify page.
 *
 * GET   ?event_ids=A,B → opted-in active vendors with phones, plus for each
 *                        the LATEST log entry per ticked event
 *                        (`log: { [event_id]: { id, at, status, reason, note } }`)
 *                        and `warning`: their latest "no WhatsApp" /
 *                        "wrong number" flag from ANY event, so a bad number
 *                        is visible before you try it again.
 *                        (?event_id=A still works for a single event.)
 * POST  { event_ids, vendor_id | vendor_ids, message } → record that one
 *                        message covering those events was sent (one row per
 *                        event per vendor). vendor_ids = a broadcast list.
 *                        Returns the new entries.
 * PATCH { log_ids, flag: reason | null, note? } → flag those sends as not
 *                        delivered (status 'failed' + reason), or clear the
 *                        flag (flag: null → back to 'sent').
 *
 * CONCEPT: we don't send WhatsApp messages from the server (that needs the
 * paid Business API). The admin opens each chat with the message pre-typed
 * and presses Send in their own WhatsApp; we only keep the record here, so
 * nobody is messaged twice and failed sends can be followed up.
 * Swapping in the official API later only means replacing that click with a
 * server call in POST.
 */
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/server/supabase';
import { handle, HttpError, must, requireAdmin } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

/** Reasons an admin can give when flagging a send. */
const FLAG_REASONS = ['not_received', 'no_whatsapp', 'wrong_number', 'other'] as const;
/** Reasons that are about the NUMBER (not one message), shown on every later visit. */
const NUMBER_REASONS = ['no_whatsapp', 'wrong_number'];

type LogRow = {
  id: number;
  event_id: string | null;
  vendor_id: string;
  created_at: string;
  status: 'sent' | 'failed';
  flag_reason: string | null;
  flag_note: string | null;
  flagged_at: string | null;
};
const LOG_COLS = 'id, event_id, vendor_id, created_at, status, flag_reason, flag_note, flagged_at';

/** Shape one log row for the page. */
const entry = (l: LogRow) => ({
  id: l.id,
  at: l.created_at,
  status: l.status,
  reason: l.flag_reason,
  note: l.flag_note,
  flagged_at: l.flagged_at,
});

export const GET = handle(async (req) => {
  await requireAdmin(req);
  // Which events we're announcing: comma-separated list (or a single id).
  const params = new URL(req.url).searchParams;
  const eventIds = (params.get('event_ids') ?? params.get('event_id') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  // Three independent reads at once: vendors, the ticked events' log, and
  // any "bad number" flags (from any event).
  const [vendorsRes, logsRes, warnRes] = await Promise.all([
    supabase
      .from('vendors')
      .select('id, vendor_code, business_name, contact_name, phone, vendor_type_id, offerings, vendor_type:vendor_types(name)')
      .eq('is_active', true)
      .eq('whatsapp_opt_in', true)
      .not('phone', 'is', null)
      .order('business_name'),
    eventIds.length
      ? supabase.from('notification_log').select(LOG_COLS).in('event_id', eventIds).order('created_at', { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from('notification_log')
      .select(LOG_COLS)
      .eq('status', 'failed')
      .in('flag_reason', NUMBER_REASONS)
      .order('flagged_at', { ascending: true }),
  ]);
  const vendors = must(vendorsRes) as { id: string }[];
  const logs = must(logsRes) as LogRow[];
  const warns = must(warnRes) as LogRow[];

  // Latest entry per vendor per event (rows are oldest-first: last write wins).
  const log: Record<string, Record<string, ReturnType<typeof entry>>> = {};
  logs.forEach((l) => l.event_id && ((log[l.vendor_id] ??= {})[l.event_id] = entry(l)));

  // Latest number problem per vendor. A later successful send (status 'sent'
  // created after the flag) means the number works after all → no warning.
  const warning: Record<string, ReturnType<typeof entry>> = {};
  warns.forEach((w) => (warning[w.vendor_id] = entry(w)));
  Object.entries(log).forEach(([vid, byEvent]) => {
    const w = warning[vid];
    if (w && Object.values(byEvent).some((e) => e.status === 'sent' && e.at > (w.flagged_at ?? w.at))) delete warning[vid];
  });

  return NextResponse.json({
    vendors: vendors.map((v) => ({ ...v, log: log[v.id] ?? {}, warning: warning[v.id] ?? null })),
  });
});

export const POST = handle(async (req) => {
  await requireAdmin(req);
  const body = (await req.json()) as {
    event_ids?: string[];
    event_id?: string; // older single-event form
    vendor_id?: string;
    vendor_ids?: string[];
    message?: string;
  };
  const { message } = body;
  const vendorIds = [...new Set(body.vendor_ids ?? (body.vendor_id ? [body.vendor_id] : []))];
  if (!vendorIds.length || !message) throw new HttpError(400, 'vendor_id(s) and message are required');
  if (vendorIds.length > 1000) throw new HttpError(400, 'Too many vendors in one go');
  const eventIds = [...new Set(body.event_ids ?? (body.event_id ? [body.event_id] : []))];

  // One row per (event, vendor) the message covered (or event-less rows), all
  // with the same text, so each event's "Not yet sent" list stays accurate.
  const events = eventIds.length ? eventIds : [null];
  const rows = must(
    await supabase
      .from('notification_log')
      .insert(vendorIds.flatMap((vendor_id) => events.map((event_id) => ({ event_id, vendor_id, message }))))
      .select(LOG_COLS),
  ) as LogRow[];
  return NextResponse.json({
    ok: true,
    sent_at: rows[0]?.created_at ?? new Date().toISOString(),
    entries: rows.map((l) => ({ vendor_id: l.vendor_id, event_id: l.event_id, ...entry(l) })),
  });
});

export const PATCH = handle(async (req) => {
  await requireAdmin(req);
  const body = (await req.json()) as { log_ids?: number[]; flag?: string | null; note?: string };
  const ids = [...new Set((body.log_ids ?? []).map(Number).filter(Number.isInteger))];
  if (!ids.length) throw new HttpError(400, 'log_ids are required');
  const flag = body.flag ?? null;
  if (flag !== null && !(FLAG_REASONS as readonly string[]).includes(flag)) throw new HttpError(400, 'Unknown flag reason');

  // Flag → status 'failed' + reason; unflag → back to a normal 'sent' entry.
  const patch =
    flag === null
      ? { status: 'sent', flag_reason: null, flag_note: null, flagged_at: null }
      : { status: 'failed', flag_reason: flag, flag_note: body.note?.trim().slice(0, 300) || null, flagged_at: new Date().toISOString() };
  const rows = must(await supabase.from('notification_log').update(patch).in('id', ids).select(LOG_COLS)) as LogRow[];
  return NextResponse.json({ entries: rows.map((l) => ({ vendor_id: l.vendor_id, event_id: l.event_id, ...entry(l) })) });
});
