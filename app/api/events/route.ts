/**
 * GET /api/events — events a vendor can book: status 'open' and not yet
 * ended (end_date today or later, Malaysia time), soonest start first,
 * with available-stall counts. Events already under way are still listed.
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
  // Expiry runs alongside the event query; stall counts are read after it.
  const [, eventsRes] = await Promise.all([
    expireStaleHolds(),
    supabase.from('events').select('*').eq('status', 'open').gte('end_date', todayMYT()).order('start_date', { ascending: true }),
  ]);
  const events = must(eventsRes) as EventRow[];
  return NextResponse.json({ events: await listEventSummaries(events) });
});
