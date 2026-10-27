/**
 * /api/admin/notify — WhatsApp "send links" for announcing an event.
 *
 * GET  ?event_id=X → opted-in active vendors with phones, plus when each was
 *                    last messaged about this event.
 * POST { event_id, vendor_id, message } → record that a message was sent.
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
  const eventId = new URL(req.url).searchParams.get('event_id');

  const vendors = must(
    await supabase
      .from('vendors')
      .select('id, business_name, contact_name, phone, category')
      .eq('is_active', true)
      .eq('whatsapp_opt_in', true)
      .not('phone', 'is', null)
      .order('business_name'),
  ) as { id: string }[];

  // Latest send time per vendor for this event.
  const lastSent: Record<string, string> = {};
  if (eventId) {
    const logs = must(
      await supabase
        .from('notification_log')
        .select('vendor_id, created_at')
        .eq('event_id', eventId)
        .order('created_at', { ascending: true }),
    ) as { vendor_id: string; created_at: string }[];
    logs.forEach((l) => (lastSent[l.vendor_id] = l.created_at));
  }

  return NextResponse.json({
    vendors: vendors.map((v) => ({ ...v, last_sent: lastSent[v.id] ?? null })),
  });
});

export const POST = handle(async (req) => {
  await requireAdmin(req);
  const { event_id, vendor_id, message } = (await req.json()) as {
    event_id?: string;
    vendor_id?: string;
    message?: string;
  };
  if (!vendor_id || !message) throw new HttpError(400, 'vendor_id and message are required');
  const row = must(
    await supabase
      .from('notification_log')
      .insert({ event_id: event_id || null, vendor_id, message })
      .select('created_at')
      .single(),
  );
  return NextResponse.json({ ok: true, sent_at: (row as { created_at: string }).created_at });
});
