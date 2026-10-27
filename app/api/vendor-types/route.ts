/**
 * GET /api/vendor-types — the list of vendor types (Products, Services, …)
 * for the type dropdowns on the vendor profile and admin screens.
 * Public: it's just a list of labels.
 */
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/server/supabase';
import { handle, must } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => {
  const types = must(await supabase.from('vendor_types').select('id, name, sort_order').order('sort_order').order('name'));
  return NextResponse.json({ types });
});
