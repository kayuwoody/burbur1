/**
 * / — upcoming events open for booking (the "pick a date" step).
 */
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { eventDays, formatDateRange, rm } from '@/lib/util';
import type { EventSummary } from '@/lib/types';

export default function HomePage() {
  const [events, setEvents] = useState<EventSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ events: EventSummary[] }>('/api/events')
      .then((r) => setEvents(r.events))
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <>
      <h1>Upcoming events</h1>
      <p className="muted">Pick a date, then choose your stalls on the map.</p>
      {error && <p className="error">{error}</p>}
      {!events && !error && <p className="muted">Loading…</p>}
      {events?.length === 0 && <div className="card muted">No events are open for booking right now. Check back soon!</div>}
      <div className="grid">
        {events?.map((e) => (
          <Link key={e.id} href={`/events/${e.id}`} className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="small muted">
              {formatDateRange(e.start_date, e.end_date)}
              {eventDays(e.start_date, e.end_date) > 1 && ` · ${eventDays(e.start_date, e.end_date)} days`}
            </div>
            <h2 style={{ margin: '4px 0 8px' }}>{e.name}</h2>
            <div className="spread small">
              <span>
                <strong>{e.counts.available}</strong> of {e.counts.total - e.counts.blocked} stalls available
              </span>
              {e.min_price !== null && <span className="muted">from {rm(e.min_price)}</span>}
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
