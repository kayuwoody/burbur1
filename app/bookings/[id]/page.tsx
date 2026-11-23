/**
 * /bookings/[id] — booking detail: bank details to pay into, hold deadline,
 * and upload of the transfer receipt.
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRequireAuth } from '@/components/AuthProvider';
import { api } from '@/lib/api';
import { formatDateTime, rm, setupUrl } from '@/lib/util';
import BookingItems from '@/components/BookingItems';
import DocumentLinks from '@/components/DocumentLinks';
import type { Booking, Settings } from '@/lib/types';
import { useT } from '@/components/LanguageProvider';

export default function BookingDetailPage({ params }: { params: { id: string } }) {
  const { ready } = useRequireAuth('user');
  const [data, setData] = useState<{ booking: Booking; payment: Settings } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const { t, locale } = useT();

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
      setUploadMsg(t('booking.uploadOk'));
      setFile(null);
      load();
    } catch (err) {
      setUploadMsg(err instanceof Error ? err.message : t('booking.uploadFailed'));
    } finally {
      setUploading(false);
    }
  }

  if (!ready || (!data && !error)) return <p className="muted">{t('common.loading')}</p>;
  if (error) return <p className="error">{error}</p>;
  const { booking: b, payment: p } = data!;
  const awaitingPayment = b.status === 'pending_payment' || b.status === 'payment_submitted';

  return (
    <div className="narrow">
      <div className="spread">
        <h1>{t('booking.title', { ref: b.ref })}</h1>
        <span className={`pill pill-${b.status}`}>{t(`status.${b.status}`)}</span>
      </div>

      <div className="card">
        <BookingItems items={b.items} />
        <div className="spread" style={{ marginTop: 10 }}>
          <strong>{t('common.total')}</strong>
          <strong>{rm(b.total)}</strong>
        </div>
      </div>

      {b.status === 'pending_payment' && b.expires_at && (
        <div className="card">
          <strong>{t('booking.heldUntil', { time: formatDateTime(b.expires_at, locale) })}</strong>
          <p className="small muted" style={{ marginBottom: 0 }}>
            {t('booking.heldNote')}
          </p>
        </div>
      )}

      {awaitingPayment && (
        <div className="card stack">
          <h2 style={{ marginTop: 0 }}>{t('booking.payTitle')}</h2>
          {p.bank_account_no ? (
            <table>
              <tbody>
                <tr><td className="muted">{t('booking.bank')}</td><td>{p.bank_name}</td></tr>
                <tr><td className="muted">{t('booking.accName')}</td><td>{p.bank_account_name}</td></tr>
                <tr><td className="muted">{t('booking.accNo')}</td><td><strong>{p.bank_account_no}</strong></td></tr>
                <tr><td className="muted">{t('booking.amount')}</td><td><strong>{rm(b.total)}</strong></td></tr>
                <tr><td className="muted">{t('booking.reference')}</td><td><strong>{b.ref}</strong></td></tr>
              </tbody>
            </table>
          ) : (
            <p className="muted">{t('booking.bankSoon')}</p>
          )}
          {p.payment_note && <p className="small" style={{ whiteSpace: 'pre-wrap' }}>{p.payment_note}</p>}

          <form onSubmit={upload} className="stack">
            <label htmlFor="receipt">
              {t(b.status === 'payment_submitted' ? 'booking.uploadAgain' : 'booking.upload')}
            </label>
            <input id="receipt" type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <button className="btn btn-primary" disabled={!file || uploading}>
              {uploading ? t('booking.uploading') : t('booking.submitReceipt')}
            </button>
            {uploadMsg && <p className="small">{uploadMsg}</p>}
          </form>
        </div>
      )}

      {b.status === 'confirmed' && <p className="card success">{t('booking.confirmed')}</p>}
      {b.status === 'expired' && <p className="card error">{t('booking.expired')}</p>}
      {b.status === 'cancelled' && (
        <p className="card error">{t('booking.cancelled')}{b.admin_note ? ` ${t('booking.note', { note: b.admin_note })}` : ''}</p>
      )}

      {b.docs?.some((d) => !d.voided_at) && (
        <div className="card stack">
          <strong>{t('booking.documents')}</strong>
          <DocumentLinks docs={b.docs} />
          <p className="small muted" style={{ margin: 0 }}>
            {t(b.status === 'confirmed' ? 'booking.receiptReady' : 'booking.receiptLater')}
          </p>
        </div>
      )}

      {/* Setup form: crew for work passes + power needs, per event */}
      {!!b.setup?.length && (
        <div className="card stack">
          <strong>{t('booking.setupTitle')}</strong>
          <p className="small muted" style={{ margin: 0 }}>
            {t('booking.setupNote')}
          </p>
          <div className="row">
            {b.setup.map((s) => (
              <Link key={s.event_id} href={setupUrl(s.access_token)} className={`btn btn-sm ${s.submitted_at ? '' : 'btn-primary'}`}>
                {s.submitted_at ? '✓ ' : ''}
                {b.items.find((i) => i.event_id === s.event_id)?.event?.name ?? s.event_id}: {t(s.submitted_at ? 'booking.setupView' : 'booking.setupFill')}
              </Link>
            ))}
          </div>
        </div>
      )}

      <Link href="/bookings" className="btn">{t('booking.back')}</Link>
    </div>
  );
}
