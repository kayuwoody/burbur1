/**
 * /admin/events/[id]/setup — vendors' setup details for one event.
 *
 * CONCEPT: each vendor has a setup form for the event (secret link, no
 * login). This page shows who has filled it in, their crew and power needs,
 * and lets the admin:
 *   - WhatsApp a vendor their form link;
 *   - add a form for any vendor via the picker (e.g. someone added by hand
 *     who isn't on the stall map);
 *   - download the work-pass list (CSV) for the venue's security office.
 * Vendors on a stall get their form automatically; online bookings also get
 * the link in their payment-confirmation message.
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRequireAuth } from '@/components/AuthProvider';
import { api } from '@/lib/api';
import { formatDateRange, formatDateTime, setupUrl, siteOrigin, waLink } from '@/lib/util';
import type { Vendor } from '@/lib/types';

type Row = {
  vendor: { id: string; vendor_code: string; business_name: string; contact_name: string | null; phone: string | null };
  stalls: string[];
  allocated_watts: number;
  access_token: string;
  submitted_at: string | null;
  updated_at: string | null;
  workers: { name: string; ic: string }[];
  extra_power: boolean | null;
  power_items: { device: string; watts: number }[];
  power_total: number;
};
type Payload = { event: { id: string; name: string; start_date: string; end_date: string; venue: string | null }; vendors: Row[] };

/** Show only the last 4 digits of an IC on screen; the CSV has it in full. */
const maskIc = (ic: string) => (ic.length > 4 ? '•'.repeat(ic.length - 4) + ic.slice(-4) : ic);

export default function EventSetupPage({ params }: { params: { id: string } }) {
  const { ready } = useRequireAuth('admin');
  const [data, setData] = useState<Payload | null>(null);
  const [open, setOpen] = useState<string | null>(null); // vendor id expanded
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<Payload>(`/api/admin/events/${params.id}/setup`).then(setData).catch((e: Error) => setError(e.message));
  }, [params.id]);
  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  if (!ready || !data) return <p className={error ? 'error' : 'muted'}>{error ?? 'Loading…'}</p>;
  const { event, vendors } = data;
  const origin = siteOrigin(); // tidied NEXT_PUBLIC_SITE_URL (see lib/util.ts)
  const done = vendors.filter((v) => v.submitted_at).length;

  /** The WhatsApp message with the vendor's personal form link. */
  const message = (r: Row) =>
    `Hi ${r.vendor.contact_name || r.vendor.business_name}! For ${event.name} (${formatDateRange(event.start_date, event.end_date)}), ` +
    `please fill in your setup details (crew names & IC for the venue's work passes, and any power-hungry appliances):\n` +
    `${setupUrl(r.access_token, origin)}\nThank you!`;

  /** Download the work-pass list: one line per person, ready for security. */
  function downloadCsv() {
    const q = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
    const lines = [['Stall', 'Vendor', 'Full name', 'IC number'].map(q).join(',')];
    for (const r of vendors) for (const w of r.workers) lines.push([r.stalls.join(' / '), r.vendor.business_name, w.name, w.ic].map(q).join(','));
    // BOM so Excel opens it as UTF-8.
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `work-passes-${event.id}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const totalWorkers = vendors.reduce((s, r) => s + r.workers.length, 0);

  return (
    <>
      <div className="spread">
        <div>
          <div className="small muted">{formatDateRange(event.start_date, event.end_date)} · Event {event.id}{event.venue && <> · {event.venue}</>}</div>
          <h1 style={{ marginTop: 4 }}>Setup details: {event.name}</h1>
        </div>
        <Link href={`/admin/events/${event.id}`} className="btn btn-sm">← Event map</Link>
      </div>

      <div className="row" style={{ marginBottom: 12 }}>
        <span className="pill pill-confirmed">{done} of {vendors.length} submitted</span>
        <span className="small muted">{totalWorkers} people for work passes</span>
        <span style={{ flex: 1 }} />
        <button className="btn btn-sm btn-primary" disabled={!totalWorkers} onClick={downloadCsv}>Download work-pass list (CSV)</button>
      </div>

      <AddVendor eventId={event.id} existing={new Set(vendors.map((v) => v.vendor.id))} onAdded={setData} />

      <div className="card table-wrap">
        <table>
          <thead>
            <tr><th>Stall</th><th>Vendor</th><th>Status</th><th>Crew</th><th>Extra power</th><th></th></tr>
          </thead>
          <tbody>
            {vendors.map((r) => {
              const wa = waLink(r.vendor.phone, message(r));
              const over = r.allocated_watts > 0 && r.power_total > r.allocated_watts;
              return [
                <tr key={r.vendor.id}>
                  <td>{r.stalls.join(', ') || <span className="muted small">No stall</span>}</td>
                  <td>
                    <Link href={`/admin/vendors/${r.vendor.id}`}>{r.vendor.business_name}</Link>
                    <div className="small muted">{r.vendor.vendor_code}</div>
                  </td>
                  <td className="small">
                    {r.submitted_at ? <span className="pill pill-confirmed">Submitted</span> : <span className="pill pill-pending_payment">Waiting</span>}
                    {r.updated_at && <div className="muted">{formatDateTime(r.updated_at)}</div>}
                  </td>
                  <td>{r.workers.length || '–'}</td>
                  <td className="small">
                    {r.extra_power === null ? '–' : r.extra_power ? (
                      <span className={over ? 'error' : undefined} title={over ? `Over the ${r.allocated_watts} W allocated to their stall(s)` : undefined}>
                        {r.power_total.toLocaleString()} W{over && ' ⚠'}
                      </span>
                    ) : 'Standard only'}
                  </td>
                  <td className="right" style={{ whiteSpace: 'nowrap' }}>
                    {r.submitted_at && <button className="btn btn-sm" onClick={() => setOpen(open === r.vendor.id ? null : r.vendor.id)}>{open === r.vendor.id ? 'Hide' : 'View'}</button>}{' '}
                    <a className="btn btn-sm" href={setupUrl(r.access_token)} target="_blank" rel="noreferrer" title="Open the form (you can fill it in for them)">Form</a>{' '}
                    {wa && <a className="btn btn-sm btn-wa" href={wa} target="_blank" rel="noreferrer">WhatsApp</a>}
                  </td>
                </tr>,
                open === r.vendor.id && (
                  <tr key={`${r.vendor.id}-d`}>
                    <td colSpan={6} style={{ background: 'var(--bg)' }}>
                      <div className="grid">
                        <div>
                          <strong className="small">Setup crew</strong>
                          <table className="small"><tbody>
                            {r.workers.map((w, i) => <tr key={i}><td>{w.name}</td><td title="Full IC in the CSV download">{maskIc(w.ic)}</td></tr>)}
                          </tbody></table>
                        </div>
                        <div>
                          <strong className="small">Appliances {r.allocated_watts > 0 && <span className="muted">(stall allocation {r.allocated_watts.toLocaleString()} W)</span>}</strong>
                          {r.extra_power ? (
                            <table className="small"><tbody>
                              {r.power_items.map((p, i) => <tr key={i}><td>{p.device}</td><td className="right">{p.watts.toLocaleString()} W</td></tr>)}
                              <tr><td><strong>Total</strong></td><td className="right"><strong>{r.power_total.toLocaleString()} W</strong></td></tr>
                            </tbody></table>
                          ) : <p className="small muted">Standard items only (LED lights, chargers).</p>}
                        </div>
                      </div>
                    </td>
                  </tr>
                ),
              ];
            })}
            {vendors.length === 0 && <tr><td colSpan={6} className="muted">No vendors in this event yet. Use “Add a vendor” above, or assign stalls on the event map.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="small muted">
        Vendors on a stall get a form automatically; online bookings also receive the link in their payment-confirmation
        WhatsApp. IC numbers are shown partly hidden here; the CSV contains them in full for the security office.
      </p>
    </>
  );
}

/**
 * Vendor picker: search the vendor list and add a form for one of them
 * (for vendors created by hand who aren't on this event's stall map).
 */
function AddVendor({ eventId, existing, onAdded }: { eventId: string; existing: Set<string>; onAdded: (p: Payload) => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Vendor[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounced server-side search across name, vendor ID, phone, email…
  useEffect(() => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      api<{ vendors: Vendor[] }>(`/api/admin/vendors?q=${encodeURIComponent(q)}`).then((r) => setResults(r.vendors.slice(0, 8)));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  async function add(v: Vendor) {
    setBusy(true);
    setError(null);
    try {
      onAdded(await api<Payload>(`/api/admin/events/${eventId}/setup`, { method: 'POST', body: { vendor_id: v.id } }));
      setQ('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card stack">
      <strong className="small">Add a vendor (e.g. one you created by hand)</strong>
      <div className="combo">
        <input placeholder="Search vendor name, ID, phone or email…" value={q} onChange={(e) => setQ(e.target.value)} />
        {results.length > 0 && (
          <ul className="combo-list" role="listbox">
            {results.map((v) => (
              <li
                key={v.id}
                role="option"
                aria-selected={false}
                className="combo-opt"
                onMouseDown={(e) => {
                  e.preventDefault();
                  if (!existing.has(v.id) && !busy) add(v);
                }}
                style={existing.has(v.id) ? { opacity: 0.5, cursor: 'default' } : undefined}
              >
                {v.business_name} <span className="small muted">{v.vendor_code}{v.contact_name ? ` · ${v.contact_name}` : ''}{existing.has(v.id) ? ' · already listed' : ''}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && <p className="small error" style={{ margin: 0 }}>{error}</p>}
    </div>
  );
}
