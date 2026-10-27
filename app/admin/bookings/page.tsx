/**
 * /admin/bookings — check bank transfer receipts and confirm or reject.
 *
 * Default tab is "Receipt submitted" (the admin's to-do list). Each booking
 * has: View transfer slip (signed link), Confirm, Cancel, invoice/receipt PDFs
 * (issued automatically: invoice at checkout, receipt on confirm), and a WhatsApp button
 * that opens a pre-written message to the vendor.
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRequireAuth } from '@/components/AuthProvider';
import { api } from '@/lib/api';
import { BOOKING_STATUS_LABEL, documentUrl, formatDateRange, formatDateTime, rm, waLink } from '@/lib/util';
import BookingItems from '@/components/BookingItems';
import DocumentLinks from '@/components/DocumentLinks';
import type { Booking, BookingStatus } from '@/lib/types';

const TABS: (BookingStatus | 'all')[] = ['payment_submitted', 'pending_payment', 'confirmed', 'cancelled', 'expired', 'all'];

/**
 * Pre-written WhatsApp message for a booking's current state.
 * Admin can still edit it in WhatsApp before sending.
 */
function vendorMessage(b: Booking): string {
  const name = b.vendor?.contact_name || b.vendor?.business_name || '';
  const lines = b.items.map((i) => `• ${i.event?.name ?? i.event_id} (${i.event ? formatDateRange(i.event.start_date, i.event.end_date) : ''}): Stall ${i.stall_no}`);
  // Links to the live documents of a kind, one per line (PDFs open without login).
  const origin = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
  const links = (kind: 'invoice' | 'receipt') =>
    (b.docs ?? [])
      .filter((d) => d.kind === kind && !d.voided_at)
      .map((d) => `${d.number}: ${documentUrl(d.access_token, origin)}`)
      .join('\n');
  if (b.status === 'confirmed') {
    const receipts = links('receipt');
    return `Hi ${name}, your stall booking #${b.ref} is confirmed!\n${lines.join('\n')}${receipts ? `\n\nReceipt:\n${receipts}` : ''}\nThank you, see you there!`;
  }
  if (b.status === 'pending_payment') {
    const invoices = links('invoice');
    return `Hi ${name}, a reminder that booking #${b.ref} (${rm(b.total)}) is awaiting payment:\n${lines.join('\n')}${invoices ? `\n\nInvoice:\n${invoices}` : ''}\nPlease transfer and upload your receipt in the booking page to secure your stalls.`;
  }
  return `Hi ${name}, regarding your booking #${b.ref}:\n${lines.join('\n')}\n`;
}

export default function AdminBookingsPage() {
  const { ready } = useRequireAuth('admin');
  const [tab, setTab] = useState<(typeof TABS)[number]>('payment_submitted');
  const [focus, setFocus] = useState<string | null>(null);
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ?focus=<booking id> (linked from the event map) shows just that booking.
  useEffect(() => {
    const f = new URLSearchParams(window.location.search).get('focus');
    if (f) {
      setFocus(f);
      setTab('all');
    }
  }, []);

  const load = useCallback(() => {
    const qs = tab === 'all' ? '' : `?status=${tab}`;
    api<{ bookings: Booking[]; counts: Record<string, number> }>(`/api/admin/bookings${qs}`)
      .then((r) => {
        setBookings(r.bookings);
        setCounts(r.counts);
      })
      .catch((e: Error) => setError(e.message));
  }, [tab]);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  /** Open the receipt in a new tab via a fresh signed URL. */
  async function viewReceipt(id: string) {
    // Open the tab synchronously (popup blockers), then point it at the file.
    const w = window.open('', '_blank');
    try {
      const { url } = await api<{ url: string }>(`/api/admin/bookings/${id}/receipt`);
      if (w) w.location.href = url;
    } catch (e) {
      w?.close();
      alert(e instanceof Error ? e.message : 'Could not open receipt');
    }
  }

  /** Confirm or cancel, with an optional note shown to the vendor on cancel. */
  async function act(b: Booking, action: 'confirm' | 'cancel') {
    let note: string | null = null;
    if (action === 'cancel') {
      note = prompt(`Cancel booking #${b.ref} and release its stalls?\nOptional reason (shown to vendor):`, '');
      if (note === null) return; // admin pressed Cancel on the prompt
    } else if (!confirm(`Confirm payment of ${rm(b.total)} for booking #${b.ref}?`)) {
      return;
    }
    setBusyId(b.id);
    try {
      await api(`/api/admin/bookings/${b.id}`, { method: 'PATCH', body: { action, note } });
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusyId(null);
    }
  }

  if (!ready) return <p className="muted">Loading…</p>;
  const shown = focus ? bookings?.filter((b) => b.id === focus) : bookings;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <>
      <h1>Bookings</h1>
      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t}
            className={`tab${tab === t ? ' active' : ''}`}
            onClick={() => {
              setFocus(null);
              setTab(t);
            }}
          >
            {t === 'all' ? 'All' : BOOKING_STATUS_LABEL[t]} ({t === 'all' ? total : counts[t] ?? 0})
          </button>
        ))}
      </div>
      {focus && (
        <p className="small">
          Showing one booking. <button className="btn btn-sm" onClick={() => setFocus(null)}>Show all</button>
        </p>
      )}
      {error && <p className="error">{error}</p>}
      {shown?.length === 0 && <p className="card muted">Nothing here.</p>}

      <div className="grid">
        {shown?.map((b) => {
          const wa = waLink(b.vendor?.phone, vendorMessage(b));
          const open = b.status === 'pending_payment' || b.status === 'payment_submitted';
          return (
            <div key={b.id} className="card stack">
              <div className="spread">
                <strong>#{b.ref}</strong>
                <span className={`pill pill-${b.status}`}>{BOOKING_STATUS_LABEL[b.status]}</span>
              </div>
              <div className="small">
                {b.vendor ? <Link href={`/admin/vendors/${b.vendor.id}`}>{b.vendor.business_name}</Link> : 'Unknown vendor'}
                {b.vendor?.phone && <span className="muted"> · {b.vendor.phone}</span>}
              </div>
              <div className="small muted">
                Booked {formatDateTime(b.created_at)}
                {b.status === 'pending_payment' && b.expires_at && <> · hold until {formatDateTime(b.expires_at)}</>}
                {b.confirmed_at && <> · confirmed {formatDateTime(b.confirmed_at)}</>}
              </div>
              <BookingItems items={b.items} />
              <div className="spread">
                <span className="muted small">Total</span>
                <strong>{rm(b.total)}</strong>
              </div>
              {b.admin_note && <div className="small muted">Note: {b.admin_note}</div>}
              <DocumentLinks docs={b.docs} showVoid />
              <div className="row">
                {b.receipt_path && <button className="btn btn-sm" onClick={() => viewReceipt(b.id)}>View transfer slip</button>}
                {open && (
                  <button className="btn btn-sm btn-ok" disabled={busyId === b.id} onClick={() => act(b, 'confirm')}>
                    Confirm payment
                  </button>
                )}
                {(open || b.status === 'confirmed') && (
                  <button className="btn btn-sm btn-danger" disabled={busyId === b.id} onClick={() => act(b, 'cancel')}>
                    Cancel
                  </button>
                )}
                {wa && (
                  <a className="btn btn-sm btn-wa" href={wa} target="_blank" rel="noreferrer">WhatsApp</a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
