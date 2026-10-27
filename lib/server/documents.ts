/**
 * lib/server/documents.ts — issuing invoices and receipts.
 *
 * CONCEPT: a document is issued for a "group" = one vendor's stalls in one
 * event, from either:
 *   - an online booking (booking_id set; prices from the booking's snapshot), or
 *   - stalls the admin assigned manually (booking_id null; prices from the map).
 * All numbering and duplicate-prevention happens inside the SQL function
 * issue_document() (see 007_documents.sql), so calling these helpers twice
 * is harmless: the existing document is returned.
 */
import { supabase } from './supabase';
import { HttpError, must } from './auth';
import { compareStallNo, dateMYT, defaultDocPrefix, docDateRange, todayMYT } from '../util';
import type { DocumentLine, DocumentRow, EventRow } from '../types';

/** Identifies one billable group. */
export interface DocGroup {
  eventId: string;
  vendorId: string;
  bookingId: string | null;
}

type EventInfo = Pick<EventRow, 'id' | 'name' | 'start_date' | 'end_date' | 'venue' | 'doc_prefix'>;

/**
 * Make sure the event has an invoice prefix; fill in the default
 * ('GVO260926'-style) the first time a document is issued for it.
 */
async function ensurePrefix(event: EventInfo): Promise<void> {
  if (event.doc_prefix) return;
  const prefix = defaultDocPrefix(event.name, event.id);
  must(await supabase.from('events').update({ doc_prefix: prefix }).eq('id', event.id).is('doc_prefix', null));
  event.doc_prefix = prefix;
}

/**
 * Line item wording, following the existing invoices:
 * "Booth rental (Booth 12) for Good Vibes Only Bazaar at EkoCheras Mall 26-27 Sept 2026"
 */
export function lineDescription(event: EventInfo, stallNo: string): string {
  const venue = event.venue ? ` at ${event.venue}` : '';
  return `Booth rental (Booth ${stallNo}) for ${event.name}${venue} ${docDateRange(event.start_date, event.end_date)}`;
}

/** Gather everything an invoice for this group needs: event, vendor, stalls → lines. */
async function invoiceContent(g: DocGroup) {
  const [eventRes, vendorRes, stallsRes] = await Promise.all([
    supabase.from('events').select('id, name, start_date, end_date, venue, doc_prefix').eq('id', g.eventId).maybeSingle(),
    supabase.from('vendors').select('business_name, address').eq('id', g.vendorId).maybeSingle(),
    g.bookingId
      ? // Online booking: the price the vendor agreed to at checkout.
        supabase.from('booking_items').select('stall_no, price').eq('booking_id', g.bookingId).eq('event_id', g.eventId)
      : // Manual assignment: current map price.
        supabase
          .from('event_stalls')
          .select('stall_no, price')
          .eq('event_id', g.eventId)
          .eq('vendor_id', g.vendorId)
          .is('booking_id', null)
          .eq('status', 'booked'),
  ]);
  const event = must(eventRes) as EventInfo | null;
  const vendor = must(vendorRes) as { business_name: string; address: string | null } | null;
  const stalls = must(stallsRes) as { stall_no: string; price: number }[];
  if (!event) throw new HttpError(404, 'Event not found');
  if (!vendor) throw new HttpError(404, 'Vendor not found');
  if (!stalls.length) throw new HttpError(400, 'No stalls to invoice for this vendor');

  const lines: DocumentLine[] = stalls
    .sort((a, b) => compareStallNo(a.stall_no, b.stall_no))
    .map((s) => ({ description: lineDescription(event, s.stall_no), price: Number(s.price), total: Number(s.price) }));
  return { event, vendor, lines, total: lines.reduce((sum, l) => sum + l.total, 0) };
}

/** Turn issue_document() errors into readable HTTP errors. */
function rpcError(error: { message: string }): HttpError {
  if (error.message.includes('INVOICE_NOT_FOUND')) return new HttpError(400, 'Create the invoice first');
  if (error.message.includes('EVENT_NOT_FOUND')) return new HttpError(404, 'Event not found');
  return new HttpError(500, error.message);
}

/** Issue (or return the existing) invoice for a group. Returns the document id. */
export async function issueInvoice(g: DocGroup, issuedOn = todayMYT()): Promise<string> {
  const { event, vendor, lines, total } = await invoiceContent(g);
  await ensurePrefix(event);
  const { data, error } = await supabase.rpc('issue_document', {
    p_kind: 'invoice',
    p_event_id: g.eventId,
    p_vendor_id: g.vendorId,
    p_booking_id: g.bookingId,
    p_invoice_id: null,
    p_issued_on: issuedOn,
    p_bill_to_name: vendor.business_name,
    p_bill_to_address: vendor.address,
    p_lines: lines,
    p_total: total,
  });
  if (error) throw rpcError(error);
  return data as string;
}

/**
 * Issue (or return the existing) receipt for an invoice. The receipt copies
 * the invoice's bill-to and lines, so the two always match.
 */
export async function issueReceipt(invoiceId: string, issuedOn = todayMYT()): Promise<string> {
  const inv = must(await supabase.from('documents').select('*').eq('id', invoiceId).maybeSingle()) as DocumentRow | null;
  if (!inv || inv.kind !== 'invoice') throw new HttpError(404, 'Invoice not found');
  const { data, error } = await supabase.rpc('issue_document', {
    p_kind: 'receipt',
    p_event_id: inv.event_id,
    p_vendor_id: inv.vendor_id,
    p_booking_id: inv.booking_id,
    p_invoice_id: inv.id,
    p_issued_on: issuedOn,
    p_bill_to_name: inv.bill_to_name,
    p_bill_to_address: inv.bill_to_address,
    p_lines: inv.lines,
    p_total: inv.total,
  });
  if (error) throw rpcError(error);
  return data as string;
}

/**
 * Bring an online booking's paperwork up to date:
 *   - an invoice per event in the booking (dated the day it was booked);
 *   - if the booking is confirmed, a receipt for each (dated the day the
 *     payment was confirmed).
 * Cancelled/expired bookings get nothing new (their documents were voided).
 */
export async function syncBookingDocuments(bookingId: string): Promise<void> {
  const b = must(
    await supabase
      .from('bookings')
      .select('id, vendor_id, status, created_at, confirmed_at, items:booking_items(event_id)')
      .eq('id', bookingId)
      .maybeSingle(),
  ) as { id: string; vendor_id: string; status: string; created_at: string; confirmed_at: string | null; items: { event_id: string }[] } | null;
  if (!b || b.status === 'cancelled' || b.status === 'expired') return;

  const eventIds = [...new Set(b.items.map((i) => i.event_id))];
  for (const eventId of eventIds) {
    const invoiceId = await issueInvoice({ eventId, vendorId: b.vendor_id, bookingId: b.id }, dateMYT(b.created_at));
    if (b.status === 'confirmed') await issueReceipt(invoiceId, dateMYT(b.confirmed_at ?? Date.now()));
  }
}

/**
 * Does this booking still need documents issued? Cheap check on data we
 * already loaded, so pages only call syncBookingDocuments() when needed.
 */
export function bookingNeedsDocuments(b: {
  status: string;
  items: { event_id: string }[];
  docs?: { kind: string; event_id: string; voided_at: string | null }[];
}): boolean {
  if (b.status === 'cancelled' || b.status === 'expired') return false;
  const live = (b.docs ?? []).filter((d) => !d.voided_at);
  const events = new Set(b.items.map((i) => i.event_id));
  for (const e of events) {
    if (!live.some((d) => d.kind === 'invoice' && d.event_id === e)) return true;
    if (b.status === 'confirmed' && !live.some((d) => d.kind === 'receipt' && d.event_id === e)) return true;
  }
  return false;
}
