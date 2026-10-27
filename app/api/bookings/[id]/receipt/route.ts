/**
 * POST /api/bookings/[id]/receipt — vendor uploads proof of bank transfer.
 *
 * CONCEPT: the file goes to the private 'payment-receipts' Storage bucket and
 * the booking moves to 'payment_submitted'. From then on the hold no longer
 * auto-expires; it waits for an admin to confirm or reject.
 *
 * Body: multipart/form-data with a single `file` field (image or PDF, ≤ 10 MB).
 */
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/server/supabase';
import { handle, HttpError, must, requireVendor } from '@/lib/server/auth';
import { expireStaleHolds } from '@/lib/server/events';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];

export const POST = handle(async (req, { params }: { params: { id: string } }) => {
  const ctx = await requireVendor(req);
  // Expire first so an overdue booking can't sneak a receipt in after release.
  await expireStaleHolds();

  const booking = must(
    await supabase.from('bookings').select('id, vendor_id, status').eq('id', params.id).maybeSingle(),
  ) as { id: string; vendor_id: string; status: string } | null;
  if (!booking || booking.vendor_id !== ctx.vendor.id) throw new HttpError(404, 'Booking not found');
  if (!['pending_payment', 'payment_submitted'].includes(booking.status)) {
    throw new HttpError(400, 'This booking is no longer awaiting payment');
  }

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) throw new HttpError(400, 'Please attach a receipt');
  if (file.size > MAX_BYTES) throw new HttpError(400, 'File is too large (max 10 MB)');
  if (!ALLOWED.includes(file.type)) throw new HttpError(400, 'Please upload an image or PDF');

  // Path: <booking id>/<timestamp>.<ext> — re-uploads don't overwrite earlier ones.
  const ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
  const path = `${booking.id}/${Date.now()}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from('payment-receipts')
    .upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type });
  if (upErr) throw new HttpError(500, upErr.message);

  must(
    await supabase
      .from('bookings')
      .update({ receipt_path: path, status: 'payment_submitted' })
      .eq('id', booking.id),
  );
  return NextResponse.json({ ok: true });
});
