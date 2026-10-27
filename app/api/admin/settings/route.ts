/**
 * /api/admin/settings — bank details shown to vendors at payment, and how
 * long unpaid holds last.
 *
 * GET → settings row; PUT → update it.
 */
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/server/supabase';
import { handle, HttpError, must, requireAdmin } from '@/lib/server/auth';
import type { Settings } from '@/lib/types';

export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  await requireAdmin(req);
  return NextResponse.json({ settings: must(await supabase.from('settings').select('*').eq('id', 1).single()) });
});

export const PUT = handle(async (req) => {
  await requireAdmin(req);
  const b = (await req.json()) as Partial<Settings>;
  const hold = Math.round(Number(b.hold_hours));
  if (!(hold >= 1 && hold <= 24 * 30)) throw new HttpError(400, 'Hold time must be between 1 hour and 30 days');

  const settings = must(
    await supabase
      .from('settings')
      .update({
        hold_hours: hold,
        bank_name: b.bank_name?.trim() || null,
        bank_account_name: b.bank_account_name?.trim() || null,
        bank_account_no: b.bank_account_no?.trim() || null,
        payment_note: b.payment_note?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1)
      .select()
      .single(),
  );
  return NextResponse.json({ settings });
});
