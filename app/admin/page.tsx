/**
 * /admin — dashboard: what needs attention right now.
 */
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRequireAuth } from '@/components/AuthProvider';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/util';
import type { Booking, EventSummary } from '@/lib/types';

export default function AdminHome() {
  const { ready } = useRequireAuth('admin');
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [events, setEvents] = useState<EventSummary[]>([]);

  useEffect(() => {
    if (!ready) return;
    api<{ bookings: Booking[]; counts: Record<string, number> }>('/api/admin/bookings?status=payment_submitted').then((r) =>
      setCounts(r.counts),
    );
    api<{ events: EventSummary[] }>('/api/admin/events').then((r) => setEvents(r.events));
  }, [ready]);

  if (!ready) return <p className="muted">Loading…</p>;

  const upcoming = events.filter((e) => e.status !== 'closed').slice(0, 6);

  return (
    <>
      <h1>Admin</h1>
      <div className="grid">
        <Link href="/admin/bookings" className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="muted small">Receipts to check</div>
          <div style={{ fontSize: '2rem', fontWeight: 700 }}>{counts.payment_submitted ?? 0}</div>
        </Link>
        <Link href="/admin/bookings" className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="muted small">Awaiting payment</div>
          <div style={{ fontSize: '2rem', fontWeight: 700 }}>{counts.pending_payment ?? 0}</div>
        </Link>
        <Link href="/admin/bookings" className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="muted small">Confirmed bookings</div>
          <div style={{ fontSize: '2rem', fontWeight: 700 }}>{counts.confirmed ?? 0}</div>
        </Link>
      </div>

      <div className="spread">
        <h2>Events</h2>
        <Link href="/admin/events" className="btn btn-sm">Manage events</Link>
      </div>
      <div className="grid">
        {upcoming.map((e) => (
          <Link key={e.id} href={`/admin/events/${e.id}`} className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="spread">
              <span className="small muted">{formatDate(e.event_date)}</span>
              <span className={`pill pill-${e.status}`}>{e.status}</span>
            </div>
            <strong>{e.name}</strong>
            <div className="small muted" style={{ marginTop: 6 }}>
              {e.counts.booked} booked · {e.counts.held} held · {e.counts.available} free · {e.counts.blocked} blocked
            </div>
          </Link>
        ))}
        {upcoming.length === 0 && <p className="muted">No active events.</p>}
      </div>
    </>
  );
}
