/**
 * GET /api/events — events a vendor can book: status 'open' and dated today
 * or later (Malaysia time), soonest first, with available-stall counts.
 *
 * Public on purpose: vendors can browse dates before logging in.
 */
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/server/supabase';
import { handle, must } from '@/lib/server/auth';
import { expireStaleHolds, listEventSummaries } from '@/lib/server/events';
import { todayMYT } from '@/lib/util';
import type { EventRow } from '@/lib/types';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => {
  await expireStaleHolds();
  const events = must(
    await supabase
      .from('events')
      .select('*')
      .eq('status', 'open')
      .gte('event_date', todayMYT())
      .order('event_date', { ascending: true }),
  ) as EventRow[];
  return NextResponse.json({ events: await listEventSummaries(events) });
});
