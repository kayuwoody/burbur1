/**
 * /admin/vendors/[id] — one vendor: edit details/notes, see booking history
 * and any stalls assigned manually.
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRequireAuth } from '@/components/AuthProvider';
import { api } from '@/lib/api';
import { BOOKING_STATUS_LABEL, formatDateRange, formatDateTime, rm, waLink } from '@/lib/util';
import VendorForm, { type VendorInput } from '@/components/VendorForm';
import BookingItems from '@/components/BookingItems';
import type { Booking, Vendor } from '@/lib/types';

type Assigned = { event_id: string; stall_no: string; price: number; events: { name: string; start_date: string; end_date: string } | null };

export default function AdminVendorPage({ params }: { params: { id: string } }) {
  const { ready } = useRequireAuth('admin');
  const [data, setData] = useState<{ vendor: Vendor; bookings: Booking[]; assigned: Assigned[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ vendor: Vendor; bookings: Booking[]; assigned: Assigned[] }>(`/api/admin/vendors/${params.id}`)
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [params.id]);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  async function save(v: VendorInput) {
    const { vendor } = await api<{ vendor: Vendor }>(`/api/admin/vendors/${params.id}`, { method: 'PATCH', body: v });
    setData((d) => (d ? { ...d, vendor } : d));
  }

  if (!ready || (!data && !error)) return <p className="muted">Loading…</p>;
  if (error) return <p className="error">{error}</p>;
  const { vendor, bookings, assigned } = data!;
  const wa = waLink(vendor.phone, `Hi ${vendor.contact_name || vendor.business_name}, `);
  const lifetime = bookings.filter((b) => b.status === 'confirmed').reduce((s, b) => s + b.total, 0);

  return (
    <>
      <div className="spread">
        <div>
          <div className="small muted">
            {vendor.vendor_code}
            {vendor.vendor_type && <> · {vendor.vendor_type.name}</>}
          </div>
          <h1 style={{ marginTop: 4 }}>{vendor.business_name}</h1>
        </div>
        <div className="row">
          {wa && <a className="btn btn-wa btn-sm" href={wa} target="_blank" rel="noreferrer">WhatsApp</a>}
          {vendor.website && <a className="btn btn-sm" href={vendor.website} target="_blank" rel="noreferrer">Website</a>}
          <Link href="/admin/vendors" className="btn btn-sm">← Vendors</Link>
        </div>
      </div>
      <p className="small muted">
        Added {formatDateTime(vendor.created_at)} · {vendor.auth_user_id ? 'Has a login' : 'No login yet'} · Confirmed spend {rm(lifetime)}
      </p>

      <div className="card">
        {/* key forces the form to re-initialise if the vendor record reloads */}
        <VendorForm key={vendor.id} initial={vendor} submitLabel="Save changes" onSubmit={save} />
      </div>

      <h2>Bookings ({bookings.length})</h2>
      {bookings.length === 0 && <p className="muted">No online bookings.</p>}
      <div className="grid">
        {bookings.map((b) => (
          <div key={b.id} className="card stack">
            <div className="spread">
              <Link href={`/admin/bookings?focus=${b.id}`}><strong>#{b.ref}</strong></Link>
              <span className={`pill pill-${b.status}`}>{BOOKING_STATUS_LABEL[b.status]}</span>
            </div>
            <div className="small muted">{formatDateTime(b.created_at)}</div>
            <BookingItems items={b.items} />
            <div className="spread"><span className="small muted">Total</span><strong>{rm(b.total)}</strong></div>
          </div>
        ))}
      </div>

      {assigned.length > 0 && (
        <>
          <h2>Manually assigned stalls</h2>
          <div className="card">
            <table>
              <tbody>
                {assigned.map((a) => (
                  <tr key={`${a.event_id}/${a.stall_no}`}>
                    <td><Link href={`/admin/events/${a.event_id}`}>{a.events?.name ?? a.event_id}</Link></td>
                    <td>{a.events ? formatDateRange(a.events.start_date, a.events.end_date) : ''}</td>
                    <td>Stall {a.stall_no}</td>
                    <td className="right">{rm(a.price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
