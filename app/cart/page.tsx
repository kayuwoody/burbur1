/**
 * /cart — review stalls across all dates and check out.
 *
 * CONCEPT: checkout POSTs every cart line to /api/bookings, which holds all
 * of them atomically. If someone else grabbed a stall in the meantime, the
 * server answers 409 with the taken stalls; we drop those from the cart and
 * tell the vendor, so they can check out the rest.
 */
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { removeCartItems, setCart, toggleCartItem, useCart } from '@/lib/cart';
import { useAuth } from '@/components/AuthProvider';
import { compareStallNo, formatDateRange, rm } from '@/lib/util';
import type { CartItem } from '@/lib/types';

export default function CartPage() {
  const cart = useCart();
  const { session, me } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Group lines by event so the vendor sees one block per date.
  const groups = new Map<string, CartItem[]>();
  [...cart]
    .sort((a, b) => a.start_date.localeCompare(b.start_date) || compareStallNo(a.stall_no, b.stall_no))
    .forEach((c) => groups.set(c.event_id, [...(groups.get(c.event_id) ?? []), c]));
  const total = cart.reduce((s, c) => s + c.price, 0);

  async function checkout() {
    // Not logged in / no profile → go do that first, then come back here.
    if (!session) return router.push('/login?next=/cart');
    if (!me?.vendor) return router.push('/profile?next=/cart');

    setBusy(true);
    setError(null);
    try {
      const { booking_id } = await api<{ booking_id: string }>('/api/bookings', {
        method: 'POST',
        body: { items: cart.map((c) => ({ event_id: c.event_id, stall_no: c.stall_no })) },
      });
      setCart([]);
      router.push(`/bookings/${booking_id}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && Array.isArray(err.body.unavailable)) {
        const gone = err.body.unavailable as { event_id: string; stall_no: string }[];
        removeCartItems(gone);
        setError(
          `Sorry, these stalls were just taken and have been removed from your cart: ${gone
            .map((g) => `${g.stall_no} (${g.event_id})`)
            .join(', ')}. Please review and try again.`,
        );
      } else {
        setError(err instanceof Error ? err.message : 'Checkout failed');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="narrow">
      <h1>Your cart</h1>
      {error && <p className="card error">{error}</p>}
      {cart.length === 0 ? (
        <div className="card">
          <p className="muted">Your cart is empty.</p>
          <Link href="/" className="btn btn-primary">Browse events</Link>
        </div>
      ) : (
        <>
          {[...groups.entries()].map(([eventId, items]) => (
            <div className="card" key={eventId}>
              <div className="spread">
                <div>
                  <strong>{items[0].event_name}</strong>
                  <div className="small muted">{formatDateRange(items[0].start_date, items[0].end_date)}</div>
                </div>
                <Link href={`/events/${eventId}`} className="btn btn-sm">Edit</Link>
              </div>
              <table style={{ marginTop: 8 }}>
                <tbody>
                  {items.map((c) => (
                    <tr key={c.stall_no}>
                      <td>Stall {c.stall_no}</td>
                      <td className="right">{rm(c.price)}</td>
                      <td className="right" style={{ width: 1 }}>
                        <button className="btn btn-sm btn-danger" onClick={() => toggleCartItem(c)} aria-label={`Remove stall ${c.stall_no}`}>
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          <div className="card stack">
            <div className="spread">
              <strong>Total</strong>
              <strong>{rm(total)}</strong>
            </div>
            <p className="small muted">
              Booking holds your stalls while you pay by bank transfer. You'll get the bank details on the next screen.
              Final price is confirmed at checkout.
            </p>
            <button className="btn btn-primary btn-block" onClick={checkout} disabled={busy}>
              {busy ? 'Booking…' : session ? 'Book these stalls' : 'Log in to book'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
