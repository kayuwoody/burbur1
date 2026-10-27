/**
 * /admin/events — list all events and create new ones.
 *
 * New events start as 'draft' by default so the admin can grey out stalls
 * and adjust prices on the map before opening bookings to vendors.
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRequireAuth } from '@/components/AuthProvider';
import { api } from '@/lib/api';
import { eventDays, eventIdFromDate, formatDateRange } from '@/lib/util';
import type { EventSummary } from '@/lib/types';

export default function AdminEventsPage() {
  const { ready } = useRequireAuth('admin');
  const router = useRouter();
  const [events, setEvents] = useState<EventSummary[] | null>(null);
  const [layouts, setLayouts] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState({
    start_date: '',
    end_date: '',
    name: '',
    layout_id: 'main',
    default_price: '',
    default_power_watts: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ events: EventSummary[]; layouts: { id: string; name: string }[] }>('/api/admin/events').then((r) => {
      setEvents(r.events);
      setLayouts(r.layouts);
    });
  }, []);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  /** Create the event, then jump straight to its map to set it up. */
  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { id } = await api<{ id: string }>('/api/admin/events', {
        method: 'POST',
        body: {
          ...form,
          default_price: Number(form.default_price || 0),
          default_power_watts: Number(form.default_power_watts || 0),
        },
      });
      router.push(`/admin/events/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create event');
      setBusy(false);
    }
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  if (!ready) return <p className="muted">Loading…</p>;

  return (
    <>
      <h1>Events</h1>

      <form className="card stack" onSubmit={create}>
        <strong>New event</strong>
        <div className="grid">
          <div>
            <label>Start date *</label>
            <input type="date" required value={form.start_date} onChange={set('start_date')} />
            {form.start_date && <div className="small muted">Event ID: {eventIdFromDate(form.start_date)}</div>}
          </div>
          <div>
            <label>End date (leave blank for a one-day event)</label>
            <input type="date" min={form.start_date || undefined} value={form.end_date} onChange={set('end_date')} />
            {form.start_date && form.end_date && form.end_date >= form.start_date && (
              <div className="small muted">{eventDays(form.start_date, form.end_date)} days</div>
            )}
          </div>
          <div>
            <label>Name *</label>
            <input required placeholder="e.g. Weekend Bazaar" value={form.name} onChange={set('name')} />
          </div>
          <div>
            <label>Layout</label>
            <select value={form.layout_id} onChange={set('layout_id')}>
              {layouts.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label>Default stall price (RM)</label>
            <input type="number" min="0" step="0.01" value={form.default_price} onChange={set('default_price')} />
          </div>
          <div>
            <label>Default power per stall (W)</label>
            <input type="number" min="0" step="1" value={form.default_power_watts} onChange={set('default_power_watts')} />
          </div>
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          All stalls from the layout are added. You can then grey out unavailable stalls and adjust prices on the map.
        </p>
        {error && <p className="error small">{error}</p>}
        <div><button className="btn btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Create event'}</button></div>
      </form>

      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th><th>Dates</th><th>Name</th><th>Status</th><th>Booked</th><th>Held</th><th>Free</th><th>Blocked</th>
            </tr>
          </thead>
          <tbody>
            {events?.map((e) => (
              <tr key={e.id}>
                <td><Link href={`/admin/events/${e.id}`}>{e.id}</Link></td>
                <td>{formatDateRange(e.start_date, e.end_date)}</td>
                <td><Link href={`/admin/events/${e.id}`}>{e.name}</Link></td>
                <td><span className={`pill pill-${e.status}`}>{e.status}</span></td>
                <td>{e.counts.booked}</td>
                <td>{e.counts.held}</td>
                <td>{e.counts.available}</td>
                <td>{e.counts.blocked}</td>
              </tr>
            ))}
            {events?.length === 0 && (
              <tr><td colSpan={8} className="muted">No events yet. Create one above.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
