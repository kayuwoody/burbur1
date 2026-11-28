/**
 * /api/admin/vendors/[id]/flags — admin flags on one vendor.
 *
 * GET   → { flags: { interests: [eventId…], follow_up, follow_up_note, follow_up_at } }
 * PATCH { interest?: { event_id, on }, follow_up?: boolean, note? } → { flags }
 *
 * Used by the shared VendorFlags component on Admin → Notify and on the
 * vendor details page. Logic lives in lib/server/flags.ts.
 */
import { NextResponse } from 'next/server';
import { handle, requireAdmin } from '@/lib/server/auth';
import { loadVendorFlags, updateVendorFlags } from '@/lib/server/flags';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

export const GET = handle(async (req, { params }: Ctx) => {
  // Auth check and the read are independent: run together.
  const [, flags] = await Promise.all([requireAdmin(req), loadVendorFlags(params.id)]);
  return NextResponse.json({ flags });
});

export const PATCH = handle(async (req, { params }: Ctx) => {
  await requireAdmin(req);
  const body = (await req.json()) as Parameters<typeof updateVendorFlags>[1];
  return NextResponse.json({ flags: await updateVendorFlags(params.id, body) });
});
