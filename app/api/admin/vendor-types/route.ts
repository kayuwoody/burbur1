/**
 * /api/admin/vendor-types — manage the vendor type list.
 *
 * GET  → all types with how many vendors use each (so the admin can see
 *        which ones are safe to delete)
 * POST → add a type: { name }. New types go to the end of the list.
 */
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/server/supabase';
import { handle, HttpError, must, requireAdmin } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  // Auth check and both reads are independent → one round trip.
  const [, types, vendors] = await Promise.all([
    requireAdmin(req),
    supabase.from('vendor_types').select('id, name, sort_order').order('sort_order').order('name').then(must),
    supabase.from('vendors').select('vendor_type_id').not('vendor_type_id', 'is', null).then(must),
  ]);
  // Count vendors per type in JS (a few hundred rows at most).
  const counts = new Map<number, number>();
  (vendors as { vendor_type_id: number }[]).forEach((v) => counts.set(v.vendor_type_id, (counts.get(v.vendor_type_id) ?? 0) + 1));
  return NextResponse.json({
    types: (types as { id: number }[]).map((t) => ({ ...t, vendor_count: counts.get(t.id) ?? 0 })),
  });
});

export const POST = handle(async (req) => {
  await requireAdmin(req);
  const name = String(((await req.json()) as { name?: string }).name ?? '').trim();
  if (!name) throw new HttpError(400, 'Type name is required');

  // Append after the current last type.
  const last = must(
    await supabase.from('vendor_types').select('sort_order').order('sort_order', { ascending: false }).limit(1),
  ) as { sort_order: number }[];
  const { data, error } = await supabase
    .from('vendor_types')
    .insert({ name, sort_order: (last[0]?.sort_order ?? 0) + 1 })
    .select('id, name, sort_order')
    .single();
  if (error) throw error.code === '23505' ? new HttpError(409, 'That type already exists') : new HttpError(500, error.message);
  return NextResponse.json({ type: { ...data, vendor_count: 0 } });
});
