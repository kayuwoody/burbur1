/**
 * /api/admin/vendor-types/[id] — rename or delete one vendor type.
 *
 * PATCH  { name } → rename (every vendor of this type shows the new name,
 *                   since vendors reference the type by id)
 * DELETE          → remove; refused while vendors still use it, so nobody
 *                   silently loses their type.
 */
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/server/supabase';
import { handle, HttpError, must, requireAdmin } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

export const PATCH = handle(async (req, { params }: Ctx) => {
  await requireAdmin(req);
  const name = String(((await req.json()) as { name?: string }).name ?? '').trim();
  if (!name) throw new HttpError(400, 'Type name is required');
  const { data, error } = await supabase
    .from('vendor_types')
    .update({ name })
    .eq('id', Number(params.id))
    .select('id, name, sort_order')
    .maybeSingle();
  if (error) throw error.code === '23505' ? new HttpError(409, 'That type already exists') : new HttpError(500, error.message);
  if (!data) throw new HttpError(404, 'Type not found');
  return NextResponse.json({ type: data });
});

export const DELETE = handle(async (req, { params }: Ctx) => {
  await requireAdmin(req);
  const used = must(
    await supabase.from('vendors').select('id').eq('vendor_type_id', Number(params.id)).limit(1),
  ) as unknown[];
  if (used.length) throw new HttpError(409, 'Vendors still use this type. Change their type first.');
  must(await supabase.from('vendor_types').delete().eq('id', Number(params.id)));
  return NextResponse.json({ ok: true });
});
