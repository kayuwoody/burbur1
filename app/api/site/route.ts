/**
 * GET /api/site — public company details for the website footer.
 *
 * CONCEPT: the settings row also holds bank details and hold rules, so this
 * route picks out ONLY the fields meant for the public (name, contact and
 * social media links),
 * rather than exposing the whole row.
 */
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/server/supabase';
import { handle, must } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => {
  const s = must(
    await supabase
      .from('settings')
      .select('company_name, footer_brand, contact_name, contact_phone, contact_email, social_links')
      .eq('id', 1)
      .single(),
  );
  return NextResponse.json({ site: s });
});
