/**
 * /api/admin/events/[id]/documents — invoices & receipts for one event.
 *
 * GET  → every vendor with stalls in the event, grouped as billable units
 *        (one per online booking, plus one per vendor for manually assigned
 *        stalls), each with its current invoice/receipt if issued.
 * POST { action: 'invoice' | 'receipt', groups: [{ vendor_id, booking_id }] }
 *        → issue the missing documents for those groups, then return GET.
 *        'receipt' also creates the invoice first if needed. Receipts for
 *        online bookings are only issued once the payment is confirmed.
 */
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/server/supabase';
import { handle, HttpError, must, requireAdmin } from '@/lib/server/auth';
import { expireStaleHolds } from '@/lib/server/events';
import { issueInvoice, issueReceipt } from '@/lib/server/documents';
import { compareStallNo } from '@/lib/util';
import type { DocGroupRow, DocumentRow, DocumentSummary } from '@/lib/types';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

/** Build the grouped list for an event (shared by GET and POST). */
async function loadGroups(eventId: string) {
  await expireStaleHolds();
  const [eventRes, stallsRes, docsRes] = await Promise.all([
    supabase.from('events').select('id, name, start_date, end_date, venue, doc_prefix, doc_next_no').eq('id', eventId).maybeSingle(),
    supabase
      .from('event_stalls')
      .select('stall_no, price, status, vendor_id, booking_id, vendor:vendors(id, vendor_code, business_name, phone, contact_name)')
      .eq('event_id', eventId)
      .in('status', ['held', 'booked'])
      .not('vendor_id', 'is', null),
    supabase.from('documents').select('*').eq('event_id', eventId).order('created_at'),
  ]);
  const event = must(eventRes);
  if (!event) throw new HttpError(404, 'Event not found');
  type StallRow = {
    stall_no: string;
    price: number;
    status: string;
    vendor_id: string;
    booking_id: string | null;
    vendor: DocGroupRow['vendor'];
  };
  const stalls = must(stallsRes) as unknown as StallRow[];
  const docs = must(docsRes) as DocumentRow[];

  // Online bookings: use their snapshot prices and status.
  const bookingIds = [...new Set(stalls.map((s) => s.booking_id).filter(Boolean))] as string[];
  const bookings = bookingIds.length
    ? (must(
        await supabase
          .from('bookings')
          .select('id, ref, status, items:booking_items(stall_no, price, event_id)')
          .in('id', bookingIds),
      ) as { id: string; ref: string; status: string; items: { stall_no: string; price: number; event_id: string }[] }[])
    : [];
  const bookingById = new Map(bookings.map((b) => [b.id, b]));

  // Group stalls by vendor + booking (null booking = manual assignment).
  const groups = new Map<string, DocGroupRow>();
  for (const s of stalls) {
    const key = `${s.vendor_id}:${s.booking_id ?? 'manual'}`;
    const b = s.booking_id ? bookingById.get(s.booking_id) : undefined;
    const price = Number(b?.items.find((i) => i.event_id === eventId && i.stall_no === s.stall_no)?.price ?? s.price);
    const g =
      groups.get(key) ??
      groups
        .set(key, {
          key,
          vendor: s.vendor,
          booking_id: s.booking_id,
          booking_ref: b?.ref ?? null,
          booking_status: b?.status ?? null,
          stalls: [],
          total: 0,
          can_receipt: !s.booking_id || b?.status === 'confirmed',
          invoice: null,
          receipt: null,
        })
        .get(key)!;
    g.stalls.push({ stall_no: s.stall_no, price });
    g.total += price;
  }

  // Attach live (non-void) documents to their group.
  const summary = (d: DocumentRow): DocumentSummary => ({
    id: d.id, kind: d.kind, number: d.number, event_id: d.event_id, access_token: d.access_token, voided_at: d.voided_at, issued_on: d.issued_on,
  });
  for (const d of docs.filter((x) => !x.voided_at)) {
    const g = groups.get(`${d.vendor_id}:${d.booking_id ?? 'manual'}`);
    if (g) g[d.kind] = summary(d);
  }

  const rows = [...groups.values()].sort(
    (a, b) => compareStallNo(a.stalls[0].stall_no, b.stalls[0].stall_no),
  );
  rows.forEach((r) => r.stalls.sort((a, b) => compareStallNo(a.stall_no, b.stall_no)));
  // Voided documents are listed separately for reference.
  const voided = docs.filter((d) => d.voided_at).map(summary);
  return { event, groups: rows, voided };
}

export const GET = handle(async (req, { params }: Ctx) => {
  await requireAdmin(req);
  return NextResponse.json(await loadGroups(params.id));
});

export const POST = handle(async (req, { params }: Ctx) => {
  await requireAdmin(req);
  const { action, groups } = (await req.json()) as {
    action?: 'invoice' | 'receipt';
    groups?: { vendor_id: string; booking_id: string | null }[];
  };
  if (action !== 'invoice' && action !== 'receipt') throw new HttpError(400, 'Unknown action');
  if (!Array.isArray(groups) || !groups.length) throw new HttpError(400, 'Nothing selected');

  const current = await loadGroups(params.id);
  const errors: string[] = [];
  // Sequential on purpose: numbers are handed out in on-screen order.
  for (const sel of groups) {
    const g = current.groups.find((x) => x.vendor.id === sel.vendor_id && x.booking_id === (sel.booking_id ?? null));
    if (!g) continue;
    try {
      const invoiceId =
        g.invoice?.id ?? (await issueInvoice({ eventId: params.id, vendorId: g.vendor.id, bookingId: g.booking_id }));
      if (action === 'receipt') {
        if (!g.can_receipt) errors.push(`${g.vendor.business_name}: payment not confirmed yet`);
        else if (!g.receipt) await issueReceipt(invoiceId);
      }
    } catch (e) {
      errors.push(`${g.vendor.business_name}: ${e instanceof Error ? e.message : 'failed'}`);
    }
  }
  return NextResponse.json({ ...(await loadGroups(params.id)), errors });
});
