/**
 * POST /api/admin/events/[id]/swap — { a, b }: swap the occupants of two
 * stalls (or move a vendor into an empty one). See swap_stalls() in
 * 011_swap_stalls.sql for exactly what moves and what stays.
 *
 * Returns the refreshed map plus `moved`: who changed booth (with phone),
 * so the page can offer a WhatsApp "your booth has changed" message.
 */
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/server/supabase';
import { handle, HttpError, must, requireAdmin } from '@/lib/server/auth';
import { loadEventDetail } from '@/lib/server/events';

export const dynamic = 'force-dynamic';

export const POST = handle(async (req, { params }: { params: { id: string } }) => {
  await requireAdmin(req);
  const { a, b } = (await req.json()) as { a?: string; b?: string };
  if (!a || !b) throw new HttpError(400, 'Select two stalls to swap');

  // Who is on each stall BEFORE the swap (for the "moved" list).
  const before = must(
    await supabase
      .from('event_stalls')
      .select('stall_no, vendor:vendors(id, business_name, contact_name, phone)')
      .eq('event_id', params.id)
      .in('stall_no', [a, b]),
  ) as unknown as { stall_no: string; vendor: { id: string; business_name: string; contact_name: string | null; phone: string | null } | null }[];

  const { error } = await supabase.rpc('swap_stalls', { p_event_id: params.id, p_a: a, p_b: b });
  if (error) {
    if (error.message.includes('BOTH_EMPTY')) throw new HttpError(400, 'Both stalls are empty: nothing to swap');
    if (error.message.includes('SAME_STALL')) throw new HttpError(400, 'Pick two different stalls');
    if (error.message.includes('STALL_NOT_FOUND')) throw new HttpError(404, 'Stall not found in this event');
    throw new HttpError(500, error.message);
  }

  const moved = before
    .filter((s) => s.vendor)
    .map((s) => ({ ...s.vendor!, from: s.stall_no, to: s.stall_no === a ? b : a }));
  return NextResponse.json({ detail: await loadEventDetail(params.id, 'admin'), moved });
});
