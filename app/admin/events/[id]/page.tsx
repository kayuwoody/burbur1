/**
 * /admin/events/[id] — the admin's event map editor.
 *
 * CONCEPT: click stalls to SELECT them (multi-select), then act on the whole
 * selection from the side panel:
 *   - set price / power budget
 *   - Block (grey out, not offered this event) / Unblock
 *   - Assign to a vendor directly (offline arrangements) / Unassign
 * With nothing selected, the panel shows event settings (name, status
 * draft/open/closed) and the power budget summary.
 */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRequireAuth } from '@/components/AuthProvider';
import { api } from '@/lib/api';
import { formatDateRange, formatDateTime, rm } from '@/lib/util';
import StallMap, { Legend, type StallLook } from '@/components/StallMap';
import type { EventDetail, EventStatus, MapStall, Vendor } from '@/lib/types';

export default function AdminEventMapPage({ params }: { params: { id: string } }) {
  const { ready } = useRequireAuth('admin');
  const router = useRouter();
  const [detail, setDetail] = useState<EventDetail | null>(null);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  // Side-panel form state
  const [price, setPrice] = useState('');
  const [power, setPower] = useState('');
  const [assignTo, setAssignTo] = useState('');
  const [eventForm, setEventForm] = useState({ name: '', notes: '', end_date: '' });

  const load = useCallback(async () => {
    const d = await api<EventDetail>(`/api/admin/events/${params.id}`);
    setDetail(d);
    setEventForm({ name: d.event.name, notes: d.event.notes ?? '', end_date: d.event.end_date });
  }, [params.id]);

  useEffect(() => {
    if (!ready) return;
    load().catch((e: Error) => setMsg({ text: e.message, error: true }));
    api<{ vendors: Vendor[] }>('/api/admin/vendors').then((r) => setVendors(r.vendors.filter((v) => v.is_active)));
  }, [ready, load]);

  const selStalls = useMemo(
    () => detail?.stalls.filter((s) => selected.has(s.stall_no)) ?? [],
    [detail, selected],
  );

  // When exactly one stall is selected, pre-fill its price/power; otherwise blank.
  useEffect(() => {
    if (selStalls.length === 1) {
      setPrice(String(selStalls[0].price));
      setPower(String(selStalls[0].power_watts));
    } else {
      setPrice('');
      setPower('');
    }
  }, [selStalls]);

  if (!ready || !detail) return <p className={msg?.error ? 'error' : 'muted'}>{msg?.text ?? 'Loading…'}</p>;
  const { event, layout, stalls } = detail;

  /** Toggle a stall in/out of the selection. */
  const toggle = (s: MapStall) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(s.stall_no)) next.delete(s.stall_no);
      else next.add(s.stall_no);
      return next;
    });

  /** Admin colouring: status drives fill, selection draws an outline. */
  const look = (s: MapStall): StallLook => {
    const outline = selected.has(s.stall_no) ? 'var(--brand)' : undefined;
    switch (s.status) {
      case 'booked': return { fill: 'var(--stall-booked)', text: '#fff', outline };
      case 'held': return { fill: 'var(--stall-held)', text: '#fff', outline };
      case 'blocked': return { fill: 'var(--stall-blocked)', text: '#a8a49b', hatched: true, outline };
      default: return { fill: 'var(--stall-available)', text: '#5c4d1d', outline };
    }
  };

  const tooltip = (s: MapStall) =>
    [`Stall ${s.stall_no}`, s.status, rm(s.price), `${s.power_watts} W`, s.vendor_name].filter(Boolean).join(' · ');

  /** Send a bulk edit for the current selection, then reload the map. */
  async function applyStalls(body: Record<string, unknown>) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ skipped: string[] }>(`/api/admin/events/${params.id}/stalls`, {
        method: 'PATCH',
        body: { stall_nos: [...selected], ...body },
      });
      await load();
      setMsg({
        text: r.skipped.length
          ? `Done. Skipped ${r.skipped.join(', ')} (status didn't allow it; online bookings are managed on the Bookings page).`
          : 'Saved.',
      });
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'Failed', error: true });
    } finally {
      setBusy(false);
    }
  }

  /** Save event name/notes/status. */
  async function saveEvent(update: { name?: string; notes?: string; end_date?: string; status?: EventStatus }) {
    setBusy(true);
    setMsg(null);
    try {
      await api(`/api/admin/events/${params.id}`, { method: 'PATCH', body: update });
      await load();
      setMsg({ text: 'Event updated.' });
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'Failed', error: true });
    } finally {
      setBusy(false);
    }
  }

  async function deleteEvent() {
    if (!confirm(`Delete event ${event.id}? This cannot be undone.`)) return;
    try {
      await api(`/api/admin/events/${params.id}`, { method: 'DELETE' });
      router.push('/admin/events');
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'Failed', error: true });
    }
  }

  // ---- Power budget summary (foundation for the future power-grid view) ----
  const offered = stalls.filter((s) => s.status !== 'blocked');
  const committed = stalls.filter((s) => s.status === 'booked' || s.status === 'held');
  const watts = (list: MapStall[]) => list.reduce((sum, s) => sum + s.power_watts, 0);
  const revenue = (list: MapStall[]) => list.reduce((sum, s) => sum + s.price, 0);

  /** Quick-select helpers. */
  const selectWhere = (pred: (s: MapStall) => boolean) => setSelected(new Set(stalls.filter(pred).map((s) => s.stall_no)));

  return (
    <>
      <div className="spread">
        <div>
          <div className="small muted">{formatDateRange(event.start_date, event.end_date)} · Event {event.id}</div>
          <h1 style={{ marginTop: 4 }}>
            {event.name} <span className={`pill pill-${event.status}`}>{event.status}</span>
          </h1>
        </div>
        <div className="row">
          <Link href={`/admin/notify?event=${event.id}`} className="btn btn-sm">Notify vendors</Link>
          <Link href="/admin/events" className="btn btn-sm">← Events</Link>
        </div>
      </div>

      <div className="map-layout">
        <div>
          <StallMap layout={layout} stalls={stalls} look={look} onStallClick={toggle} tooltip={tooltip} />
          <Legend
            items={[
              { label: 'Available', color: 'var(--stall-available)' },
              { label: 'Held (awaiting payment)', color: 'var(--stall-held)' },
              { label: 'Booked', color: 'var(--stall-booked)' },
              { label: 'Blocked', color: 'var(--stall-blocked)', hatched: true },
            ]}
          />
          <div className="row small">
            <span className="muted">Select:</span>
            <button className="btn btn-sm" onClick={() => selectWhere(() => true)}>All</button>
            <button className="btn btn-sm" onClick={() => selectWhere((s) => s.status === 'available')}>Available</button>
            <button className="btn btn-sm" onClick={() => selectWhere((s) => s.status === 'blocked')}>Blocked</button>
            <button className="btn btn-sm" onClick={() => setSelected(new Set())}>None</button>
          </div>
        </div>

        <aside className="stack">
          {msg && <p className={`card small ${msg.error ? 'error' : 'success'}`}>{msg.text}</p>}

          {selected.size > 0 ? (
            // ---------- Selection panel ----------
            <div className="card stack">
              <div className="spread">
                <strong>{selected.size} stall{selected.size === 1 ? '' : 's'} selected</strong>
                <button className="btn btn-sm" onClick={() => setSelected(new Set())}>Clear</button>
              </div>
              <div className="small muted">{selStalls.map((s) => s.stall_no).join(', ')}</div>

              {selStalls.length === 1 && <SingleStallInfo stall={selStalls[0]} />}

              <div className="row" style={{ alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <label>Price (RM)</label>
                  <input type="number" min="0" step="0.01" value={price} placeholder="unchanged" onChange={(e) => setPrice(e.target.value)} />
                </div>
                <div style={{ flex: 1 }}>
                  <label>Power (W)</label>
                  <input type="number" min="0" step="1" value={power} placeholder="unchanged" onChange={(e) => setPower(e.target.value)} />
                </div>
              </div>
              <button
                className="btn btn-primary"
                disabled={busy || (price === '' && power === '')}
                onClick={() =>
                  applyStalls({
                    ...(price !== '' ? { price: Number(price) } : {}),
                    ...(power !== '' ? { power_watts: Number(power) } : {}),
                  })
                }
              >
                Save price / power
              </button>

              <div className="row">
                <button className="btn" disabled={busy} onClick={() => applyStalls({ action: 'block' })}>Grey out (block)</button>
                <button className="btn" disabled={busy} onClick={() => applyStalls({ action: 'unblock' })}>Unblock</button>
              </div>

              <div>
                <label>Assign directly to vendor</label>
                <div className="row">
                  <select value={assignTo} onChange={(e) => setAssignTo(e.target.value)} style={{ flex: 1 }}>
                    <option value="">Choose vendor…</option>
                    {vendors.map((v) => (
                      <option key={v.id} value={v.id}>{v.business_name}</option>
                    ))}
                  </select>
                  <button className="btn" disabled={busy || !assignTo} onClick={() => applyStalls({ action: 'assign', vendor_id: assignTo })}>
                    Assign
                  </button>
                </div>
                <button className="btn btn-sm btn-danger" style={{ marginTop: 6 }} disabled={busy} onClick={() => applyStalls({ action: 'unassign' })}>
                  Unassign (manual assignments only)
                </button>
              </div>
            </div>
          ) : (
            // ---------- Event panel ----------
            <>
              <div className="card stack">
                <strong>Bookings status</strong>
                <div className="row">
                  {(['draft', 'open', 'closed'] as EventStatus[]).map((s) => (
                    <button
                      key={s}
                      className={`btn btn-sm ${event.status === s ? 'btn-primary' : ''}`}
                      disabled={busy || event.status === s}
                      onClick={() => saveEvent({ status: s })}
                    >
                      {s === 'draft' ? 'Draft (hidden)' : s === 'open' ? 'Open for booking' : 'Closed'}
                    </button>
                  ))}
                </div>
                <p className="small muted" style={{ margin: 0 }}>Click stalls on the map to edit price, power, or grey them out.</p>
              </div>

              <div className="card stack">
                <strong>Summary</strong>
                <table className="small">
                  <tbody>
                    <tr><td>Stalls offered</td><td className="right">{offered.length} of {stalls.length}</td></tr>
                    <tr><td>Booked / held</td><td className="right">{stalls.filter((s) => s.status === 'booked').length} / {stalls.filter((s) => s.status === 'held').length}</td></tr>
                    <tr><td>Revenue (booked + held)</td><td className="right">{rm(revenue(committed))}</td></tr>
                    <tr><td>Potential revenue (all offered)</td><td className="right">{rm(revenue(offered))}</td></tr>
                    <tr><td>Power committed (booked + held)</td><td className="right">{watts(committed).toLocaleString()} W</td></tr>
                    <tr><td>Power if all offered stalls sell</td><td className="right">{watts(offered).toLocaleString()} W</td></tr>
                  </tbody>
                </table>
              </div>

              <div className="card stack">
                <strong>Event details</strong>
                <div>
                  <label>Name</label>
                  <input value={eventForm.name} onChange={(e) => setEventForm((f) => ({ ...f, name: e.target.value }))} />
                </div>
                <div className="row">
                  <div style={{ flex: 1 }}>
                    <label>Start date (fixed: it's the event ID)</label>
                    <input type="date" value={event.start_date} disabled />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label>End date</label>
                    <input
                      type="date"
                      min={event.start_date}
                      value={eventForm.end_date}
                      onChange={(e) => setEventForm((f) => ({ ...f, end_date: e.target.value }))}
                    />
                  </div>
                </div>
                <div>
                  <label>Internal notes</label>
                  <textarea value={eventForm.notes} onChange={(e) => setEventForm((f) => ({ ...f, notes: e.target.value }))} />
                </div>
                <div className="spread">
                  <button className="btn btn-primary" disabled={busy} onClick={() => saveEvent(eventForm)}>Save</button>
                  <button className="btn btn-sm btn-danger" onClick={deleteEvent}>Delete event</button>
                </div>
              </div>
            </>
          )}
        </aside>
      </div>
    </>
  );
}

/** Details for a single selected stall: who has it and why. */
function SingleStallInfo({ stall }: { stall: MapStall }) {
  return (
    <table className="small">
      <tbody>
        <tr><td className="muted">Status</td><td><span className={`pill pill-${stall.status}`}>{stall.status}</span></td></tr>
        {stall.vendor_id && (
          <tr>
            <td className="muted">Vendor</td>
            <td><Link href={`/admin/vendors/${stall.vendor_id}`}>{stall.vendor_name}</Link></td>
          </tr>
        )}
        {stall.booking_id && (
          <tr><td className="muted">Booking</td><td><Link href={`/admin/bookings?focus=${stall.booking_id}`}>View booking</Link></td></tr>
        )}
        {stall.vendor_id && !stall.booking_id && (
          <tr><td className="muted">Source</td><td>Assigned manually</td></tr>
        )}
        {stall.hold_expires_at && stall.status === 'held' && (
          <tr><td className="muted">Hold until</td><td>{formatDateTime(stall.hold_expires_at)}</td></tr>
        )}
      </tbody>
    </table>
  );
}
