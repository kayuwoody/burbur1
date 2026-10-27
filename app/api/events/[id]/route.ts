/**
 * GET /api/events/[id] — the stall map for one event, vendor view.
 *
 * Works logged-out (browse only). When logged in, the caller's own held/
 * booked stalls are flagged `mine: true` so the map can colour them.
 * Other vendors' identities are never included.
 */
import { NextResponse } from 'next/server';
import { handle, getAuthContext } from '@/lib/server/auth';
import { loadEventDetail } from '@/lib/server/events';

export const dynamic = 'force-dynamic';

export const GET = handle(async (req, { params }: { params: { id: string } }) => {
  // Login lookup runs in parallel with the map queries (see loadEventDetail).
  const viewer = getAuthContext(req).then((ctx) => ({ vendorId: ctx?.vendor?.id ?? null }));
  const detail = await loadEventDetail(params.id, viewer);
  return NextResponse.json(detail);
});
