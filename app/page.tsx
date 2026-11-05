/**
 * / — the public landing page: brand hero, how booking works, and the
 * upcoming events that are open for booking (the "pick a date" step).
 */
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { docAmount, eventDays, formatDateRange } from '@/lib/util';
import type { EventSummary } from '@/lib/types';

/** 'Nov', '13' from '2026-11-13' — for the ticket's date stub. */
function stub(iso: string) {
  const d = new Date(`${iso}T12:00:00Z`);
  return {
    mon: d.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' }),
    day: d.getUTCDate(),
  };
}

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
      {/* ---------- Hero ---------- */}
      <section className="hero">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo-256.png" alt="Maniacs Mansion" />
        <div className="eyebrow">Maniacs Mansion presents</div>
        <h1>Book your stall at our next bazaar</h1>
        <p>Pick an event, choose your spot on the floor plan, and secure it with a quick bank transfer.</p>
        <div className="row">
          <a href="#events" className="btn btn-gold btn-lg">See upcoming events</a>
          <Link href="/login" className="btn btn-ghost btn-lg">Vendor log in</Link>
        </div>
      </section>

      {/* ---------- How it works ---------- */}
      <div className="steps">
        <div className="step">
          <div className="step-no">1</div>
          <div><strong>Pick an event</strong><span>Browse upcoming dates and venues below.</span></div>
        </div>
        <div className="step">
          <div className="step-no">2</div>
          <div><strong>Choose your stall</strong><span>Tap a free spot on the floor plan, like choosing a cinema seat.</span></div>
        </div>
        <div className="step">
          <div className="step-no">3</div>
          <div><strong>Pay &amp; you’re in</strong><span>Transfer, upload your slip, and get your official receipt.</span></div>
        </div>
      </div>

      {/* ---------- Events ---------- */}
      <div className="section-title" id="events">
        <h2>Upcoming events</h2>
      </div>
      {error && <p className="error">{error}</p>}
      {!events && !error && <p className="muted">Loading…</p>}
      {events?.length === 0 && (
        <div className="card muted">No events are open for booking right now. Check back soon, or follow us for announcements!</div>
      )}
      <div className="grid-tickets">
        {events?.map((e) => {
          const s = stub(e.start_date);
          const days = eventDays(e.start_date, e.end_date);
          const offered = e.counts.total - e.counts.blocked;
          const pct = offered ? Math.round((e.counts.available / offered) * 100) : 0;
          return (
            <Link key={e.id} href={`/events/${e.id}`} className="ticket">
              <div className="ticket-date">
                <span className="mon">{s.mon}</span>
                <span className="day">{s.day}</span>
                {days > 1 && <span className="to">to {stub(e.end_date).day} {stub(e.end_date).mon}</span>}
              </div>
              <div className="ticket-body">
                <h3>{e.name}</h3>
                <div className="ticket-meta">
                  {formatDateRange(e.start_date, e.end_date)}
                  {days > 1 && ` · ${days} days`}
                  {e.venue && <> · {e.venue}</>}
                </div>
                {/* Gold bar: share of stalls still free */}
                <div className="avail" title={`${e.counts.available} of ${offered} stalls available`}>
                  <i style={{ width: `${pct}%` }} />
                </div>
                <div className="ticket-foot">
                  <span>
                    <strong>{e.counts.available}</strong> of {offered} stalls left
                  </span>
                  {e.min_price !== null && (
                    <span className="ticket-price">
                      from <strong>RM {docAmount(e.min_price)}</strong>
                    </span>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
