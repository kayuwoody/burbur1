/**
 * /bookings — the vendor's booking history.
 */
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRequireAuth } from '@/components/AuthProvider';
import { api } from '@/lib/api';
import { BOOKING_STATUS_LABEL, formatDateTime, rm } from '@/lib/util';
import BookingItems from '@/components/BookingItems';
import type { Booking } from '@/lib/types';

export default function MyBookingsPage() {
  const { ready } = useRequireAuth('vendor');
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    api<{ bookings: Booking[] }>('/api/bookings')
      .then((r) => setBookings(r.bookings))
      .catch((e: Error) => setError(e.message));
  }, [ready]);

  if (!ready) return <p className="muted">Loading…</p>;

  return (
    <div className="narrow">
      <h1>My bookings</h1>
      {error && <p className="error">{error}</p>}
      {bookings?.length === 0 && (
        <div className="card">
          <p className="muted">No bookings yet.</p>
          <Link href="/" className="btn btn-primary">Browse events</Link>
        </div>
      )}
      {bookings?.map((b) => (
        <Link key={b.id} href={`/bookings/${b.id}`} className="card" style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
          <div className="spread">
            <strong>#{b.ref}</strong>
            <span className={`pill pill-${b.status}`}>{BOOKING_STATUS_LABEL[b.status]}</span>
          </div>
          <div className="small muted">{formatDateTime(b.created_at)}</div>
          <div style={{ marginTop: 8 }}>
            <BookingItems items={b.items} />
          </div>
          <div className="spread" style={{ marginTop: 8 }}>
            <span className="muted small">Total</span>
            <strong>{rm(b.total)}</strong>
          </div>
        </Link>
      ))}
    </div>
  );
}
