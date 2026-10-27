/**
 * /events/[id] — vendor stall picker for one event.
 *
 * CONCEPT: click an available stall to add it to the cart, click again to
 * remove it. Taken and blocked stalls aren't clickable. Nothing is reserved
 * until checkout. The map refreshes every 20 s (and on tab focus) so stalls
 * other vendors grab show up as taken without a reload.
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { toggleCartItem, useCart } from '@/lib/cart';
import { formatDate, rm } from '@/lib/util';
import StallMap, { Legend, type StallLook } from '@/components/StallMap';
import type { EventDetail, MapStall } from '@/lib/types';

const REFRESH_MS = 20_000;

export default function EventPage({ params }: { params: { id: string } }) {
  const [detail, setDetail] = useState<EventDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cart = useCart();

  /** Fetch the latest stall statuses. */
  const load = useCallback(() => {
    api<EventDetail>(`/api/events/${params.id}`)
      .then(setDetail)
      .catch((e: Error) => setError(e.message));
  }, [params.id]);

  // Initial load + polling + refresh when the tab regains focus.
  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    window.addEventListener('focus', load);
    return () => {
      clearInterval(t);
      window.removeEventListener('focus', load);
    };
  }, [load]);

  if (error) return <p className="error">{error}</p>;
  if (!detail) return <p className="muted">Loading map…</p>;

  const { event, layout, stalls } = detail;
  const bookable = event.status === 'open';
  const inCart = new Set(cart.filter((c) => c.event_id === event.id).map((c) => c.stall_no));
  const cartHere = stalls.filter((s) => inCart.has(s.stall_no));
  const cartTotal = cart.reduce((sum, c) => sum + c.price, 0);

  /** Colour each stall from the vendor's point of view. */
  const look = (s: MapStall): StallLook => {
    if (s.mine) return { fill: 'var(--stall-mine)', text: '#fff', disabled: true };
    if (s.status === 'blocked') return { fill: 'var(--stall-blocked)', text: '#a8a49b', disabled: true, hatched: true };
    if (s.status !== 'available') return { fill: 'var(--stall-taken)', text: '#8a867d', disabled: true };
    if (inCart.has(s.stall_no)) return { fill: 'var(--stall-selected)', text: '#fff' };
    return { fill: 'var(--stall-available)', text: '#5c4d1d', disabled: !bookable };
  };

  /** Add/remove a stall from the cart. */
  const onStallClick = (s: MapStall) =>
    toggleCartItem({
      event_id: event.id,
      event_name: event.name,
      event_date: event.event_date,
      stall_no: s.stall_no,
      price: s.price,
    });

  const tooltip = (s: MapStall) =>
    s.status === 'available'
      ? `Stall ${s.stall_no} · ${rm(s.price)}${s.power_watts ? ` · ${s.power_watts} W power` : ''}`
      : `Stall ${s.stall_no} · ${s.mine ? 'yours' : 'not available'}`;

  const available = stalls.filter((s) => s.status === 'available' && !s.mine);

  return (
    <>
      <div className="spread">
        <div>
          <div className="small muted">{formatDate(event.event_date)} · Event {event.id}</div>
          <h1 style={{ marginTop: 4 }}>{event.name}</h1>
        </div>
        <Link href="/" className="btn btn-sm">← All dates</Link>
      </div>
      {!bookable && <p className="card muted">Booking for this event is closed.</p>}

      <div className="map-layout">
        <div>
          <StallMap layout={layout} stalls={stalls} look={look} onStallClick={onStallClick} tooltip={tooltip} />
          <Legend
            items={[
              { label: 'Available', color: 'var(--stall-available)' },
              { label: 'In your cart', color: 'var(--stall-selected)' },
              { label: 'Yours', color: 'var(--stall-mine)' },
              { label: 'Taken', color: 'var(--stall-taken)' },
              { label: 'Not offered', color: 'var(--stall-blocked)', hatched: true },
            ]}
          />
        </div>

        <aside className="stack">
          {/* Chip list: an easier way to pick on a small phone screen */}
          <div className="card stack">
            <strong>Available stalls ({available.length})</strong>
            <div className="chips">
              {available.map((s) => (
                <button
                  key={s.stall_no}
                  className={`chip${inCart.has(s.stall_no) ? ' on' : ''}`}
                  onClick={() => onStallClick(s)}
                  disabled={!bookable}
                  title={tooltip(s)}
                >
                  {s.stall_no} · {rm(s.price)}
                </button>
              ))}
            </div>
          </div>

          {cartHere.length > 0 && (
            <div className="card">
              <strong>Selected for this event</strong>
              <table style={{ marginTop: 8 }}>
                <tbody>
                  {cartHere.map((s) => (
                    <tr key={s.stall_no}>
                      <td>Stall {s.stall_no}</td>
                      <td className="muted small">{s.power_watts ? `${s.power_watts} W` : ''}</td>
                      <td className="right">{rm(s.price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </aside>
      </div>

      {cart.length > 0 && (
        <div className="cart-bar spread">
          <span>
            <strong>{cart.length}</strong> stall{cart.length === 1 ? '' : 's'} in cart · <strong>{rm(cartTotal)}</strong>
          </span>
          <div className="row">
            <Link href="/" className="btn">Add another date</Link>
            <Link href="/cart" className="btn btn-primary">Review & book →</Link>
          </div>
        </div>
      )}
    </>
  );
}
