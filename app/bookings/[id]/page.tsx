/**
 * /bookings/[id] — booking detail: bank details to pay into, hold deadline,
 * and upload of the transfer receipt.
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRequireAuth } from '@/components/AuthProvider';
import { api } from '@/lib/api';
import { BOOKING_STATUS_LABEL, formatDateTime, rm } from '@/lib/util';
import BookingItems from '@/components/BookingItems';
import DocumentLinks from '@/components/DocumentLinks';
import type { Booking, Settings } from '@/lib/types';

export default function BookingDetailPage({ params }: { params: { id: string } }) {
  const { ready } = useRequireAuth('user');
  const [data, setData] = useState<{ booking: Booking; payment: Settings } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ booking: Booking; payment: Settings }>(`/api/bookings/${params.id}`)
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [params.id]);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  /** Send the receipt as multipart form data. */
  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setUploadMsg(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      await api(`/api/bookings/${params.id}/receipt`, { method: 'POST', body: fd });
      setUploadMsg('Receipt received. We’ll confirm your booking once payment is verified.');
      setFile(null);
      load();
    } catch (err) {
      setUploadMsg(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  if (!ready || (!data && !error)) return <p className="muted">Loading…</p>;
  if (error) return <p className="error">{error}</p>;
  const { booking: b, payment: p } = data!;
  const awaitingPayment = b.status === 'pending_payment' || b.status === 'payment_submitted';

  return (
    <div className="narrow">
      <div className="spread">
        <h1>Booking #{b.ref}</h1>
        <span className={`pill pill-${b.status}`}>{BOOKING_STATUS_LABEL[b.status]}</span>
      </div>

      <div className="card">
        <BookingItems items={b.items} />
        <div className="spread" style={{ marginTop: 10 }}>
          <strong>Total</strong>
          <strong>{rm(b.total)}</strong>
        </div>
      </div>

      {b.status === 'pending_payment' && b.expires_at && (
        <div className="card">
          <strong>Your stalls are held until {formatDateTime(b.expires_at)}.</strong>
          <p className="small muted" style={{ marginBottom: 0 }}>
            Please transfer the total and upload your receipt before then, or the stalls will be released.
          </p>
        </div>
      )}

      {awaitingPayment && (
        <div className="card stack">
          <h2 style={{ marginTop: 0 }}>Pay by bank transfer</h2>
          {p.bank_account_no ? (
            <table>
              <tbody>
                <tr><td className="muted">Bank</td><td>{p.bank_name}</td></tr>
                <tr><td className="muted">Account name</td><td>{p.bank_account_name}</td></tr>
                <tr><td className="muted">Account no.</td><td><strong>{p.bank_account_no}</strong></td></tr>
                <tr><td className="muted">Amount</td><td><strong>{rm(b.total)}</strong></td></tr>
                <tr><td className="muted">Reference</td><td><strong>{b.ref}</strong></td></tr>
              </tbody>
            </table>
          ) : (
            <p className="muted">Bank details will be sent to you shortly.</p>
          )}
          {p.payment_note && <p className="small" style={{ whiteSpace: 'pre-wrap' }}>{p.payment_note}</p>}

          <form onSubmit={upload} className="stack">
            <label htmlFor="receipt">
              {b.status === 'payment_submitted' ? 'Upload a different receipt' : 'Upload your transfer receipt'}
            </label>
            <input id="receipt" type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <button className="btn btn-primary" disabled={!file || uploading}>
              {uploading ? 'Uploading…' : 'Submit receipt'}
            </button>
            {uploadMsg && <p className="small">{uploadMsg}</p>}
          </form>
        </div>
      )}

      {b.status === 'confirmed' && <p className="card success">Payment received. Your stalls are confirmed. See you there!</p>}
      {b.status === 'expired' && <p className="card error">This hold expired before payment was received, so the stalls were released.</p>}
      {b.status === 'cancelled' && (
        <p className="card error">This booking was cancelled.{b.admin_note ? ` Note: ${b.admin_note}` : ''}</p>
      )}

      {b.docs?.some((d) => !d.voided_at) && (
        <div className="card stack">
          <strong>Documents</strong>
          <DocumentLinks docs={b.docs} />
          <p className="small muted" style={{ margin: 0 }}>
            {b.status === 'confirmed' ? 'Your official receipt is ready.' : 'Your receipt will appear here once we confirm your payment.'}
          </p>
        </div>
      )}

      <Link href="/bookings" className="btn">← My bookings</Link>
    </div>
  );
}
