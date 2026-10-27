/**
 * GET /api/admin/bookings/[id]/receipt — short-lived link to the uploaded
 * bank transfer receipt.
 *
 * CONCEPT: the bucket is private, so files have no permanent public URL.
 * We mint a signed URL valid for 5 minutes each time an admin clicks "View".
 */
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/server/supabase';
import { handle, HttpError, must, requireAdmin } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

export const GET = handle(async (req, { params }: { params: { id: string } }) => {
  await requireAdmin(req);
  const b = must(
    await supabase.from('bookings').select('receipt_path').eq('id', params.id).maybeSingle(),
  ) as { receipt_path: string | null } | null;
  if (!b?.receipt_path) throw new HttpError(404, 'No receipt uploaded');

  const { data, error } = await supabase.storage.from('payment-receipts').createSignedUrl(b.receipt_path, 300);
  if (error || !data) throw new HttpError(500, error?.message ?? 'Could not create link');
  return NextResponse.json({ url: data.signedUrl });
});
