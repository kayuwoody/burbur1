/**
 * GET   /api/admin/documents/[id] — one document (for the edit form).
 * PATCH /api/admin/documents/[id] — correct an issued document.
 * Body: { number?, issued_on?, bill_to_name?, bill_to_address?, refresh_lines? }
 *
 * CONCEPT: documents are snapshots, so fixing a typo in a vendor's address
 * doesn't change invoices already issued. This lets an admin correct one
 * directly, or set a specific number to continue existing paper numbering.
 * refresh_lines: true re-copies the line items from the current event
 * details (e.g. after adding the venue name).
 * refresh_bill_to: true re-copies the vendor's current business name and
 * address (e.g. after the address was added to the vendor record).
 */
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/server/supabase';
import { handle, HttpError, must, requireAdmin } from '@/lib/server/auth';
import { lineDescription } from '@/lib/server/documents';
import type { DocumentLine, DocumentRow, EventRow } from '@/lib/types';

export const dynamic = 'force-dynamic';

export const GET = handle(async (req, { params }: { params: { id: string } }) => {
  await requireAdmin(req);
  const doc = must(await supabase.from('documents').select('*').eq('id', params.id).maybeSingle());
  if (!doc) throw new HttpError(404, 'Document not found');
  return NextResponse.json({ document: doc });
});

export const PATCH = handle(async (req, { params }: { params: { id: string } }) => {
  await requireAdmin(req);
  const body = (await req.json()) as {
    number?: string;
    issued_on?: string;
    bill_to_name?: string;
    bill_to_address?: string | null;
    refresh_lines?: boolean;
    refresh_bill_to?: boolean;
  };

  const doc = must(await supabase.from('documents').select('*').eq('id', params.id).maybeSingle()) as DocumentRow | null;
  if (!doc) throw new HttpError(404, 'Document not found');

  const update: Record<string, unknown> = {};
  if (body.number !== undefined) {
    const n = body.number.trim().toUpperCase();
    if (!n) throw new HttpError(400, 'Number is required');
    update.number = n;
  }
  if (body.issued_on !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.issued_on)) throw new HttpError(400, 'Invalid date');
    update.issued_on = body.issued_on;
  }
  if (body.bill_to_name !== undefined) {
    if (!body.bill_to_name.trim()) throw new HttpError(400, 'Name is required');
    update.bill_to_name = body.bill_to_name.trim();
  }
  if (body.bill_to_address !== undefined) update.bill_to_address = body.bill_to_address?.trim() || null;

  if (body.refresh_bill_to) {
    const vendor = must(
      await supabase.from('vendors').select('business_name, address').eq('id', doc.vendor_id).single(),
    ) as { business_name: string; address: string | null };
    update.bill_to_name = vendor.business_name;
    update.bill_to_address = vendor.address;
  }

  if (body.refresh_lines) {
    // Re-word each line from the current event details; prices stay as issued.
    const event = must(
      await supabase.from('events').select('id, name, start_date, end_date, venue, doc_prefix').eq('id', doc.event_id).single(),
    ) as EventRow;
    update.lines = (doc.lines as DocumentLine[]).map((l) => {
      const stall = /\(Booth ([^)]+)\)/.exec(l.description)?.[1];
      return stall ? { ...l, description: lineDescription(event, stall) } : l;
    });
  }

  if (!Object.keys(update).length) return NextResponse.json({ document: doc });
  const { data, error } = await supabase.from('documents').update(update).eq('id', params.id).select().single();
  if (error) {
    if (error.code === '23505') throw new HttpError(409, 'That number is already used by another document');
    throw new HttpError(500, error.message);
  }
  return NextResponse.json({ document: data });
});
