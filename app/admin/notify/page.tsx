/**
 * /admin/notify — announce an event to vendors over WhatsApp.
 *
 * CONCEPT: pick an event and write the message once using placeholders.
 * Each vendor row gets a "Send" button that opens WhatsApp with the
 * personalised message pre-filled (wa.me link), using the company's
 * existing WhatsApp Business app. No API account or per-message fee.
 * Clicking also logs the send, so the list shows who's already been told.
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRequireAuth } from '@/components/AuthProvider';
import { useVendorTypes } from '@/components/useVendorTypes';
import { api } from '@/lib/api';
import { fillTemplate, formatDateRange, formatDateTime, waLink } from '@/lib/util';
import type { EventSummary } from '@/lib/types';

type Row = {
  id: string;
  vendor_code: string;
  business_name: string;
  contact_name: string | null;
  phone: string | null;
  vendor_type_id: number | null;
  vendor_type: { name: string } | null;
  offerings: string | null;
  last_sent: string | null;
};

const DEFAULT_TEMPLATE =
  'Hi {name}! Stall bookings for *{event}* ({date}) are now open. Pick your spot here: {link}\n\nFirst come, first served!';

export default function AdminNotifyPage() {
  const { ready } = useRequireAuth('admin');
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [eventId, setEventId] = useState('');
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [filter, setFilter] = useState<'unsent' | 'all'>('unsent');
  // Vendor type filter: '' = everyone, else a type id (e.g. only Activities).
  const [typeFilter, setTypeFilter] = useState('');
  const types = useVendorTypes();

  // Load events once; preselect ?event= if we came from an event page.
  useEffect(() => {
    if (!ready) return;
    api<{ events: EventSummary[] }>('/api/admin/events').then((r) => {
      const usable = r.events.filter((e) => e.status !== 'closed');
      setEvents(usable);
      const pre = new URLSearchParams(window.location.search).get('event');
      setEventId(pre && usable.some((e) => e.id === pre) ? pre : usable[0]?.id ?? '');
    });
  }, [ready]);

  const load = useCallback(() => {
    if (!eventId) return;
    api<{ vendors: Row[] }>(`/api/admin/notify?event_id=${eventId}`).then((r) => setRows(r.vendors));
  }, [eventId]);

  useEffect(() => {
    load();
  }, [load]);

  const event = events.find((e) => e.id === eventId);
  const site = process.env.NEXT_PUBLIC_SITE_URL || (typeof window !== 'undefined' ? window.location.origin : '');

  /** Personalise the template for one vendor. */
  const messageFor = (r: Row) =>
    fillTemplate(template, {
      name: r.contact_name || r.business_name,
      business: r.business_name,
      event: event?.name ?? '',
      date: event ? formatDateRange(event.start_date, event.end_date) : '',
      link: `${site}/events/${eventId}`,
    });

  /** Log the send. The <a> itself opens WhatsApp in a new tab. */
  async function logSend(r: Row) {
    const msg = messageFor(r);
    try {
      const { sent_at } = await api<{ sent_at: string }>('/api/admin/notify', {
        method: 'POST',
        body: { event_id: eventId, vendor_id: r.id, message: msg },
      });
      setRows((rs) => rs?.map((x) => (x.id === r.id ? { ...x, last_sent: sent_at } : x)) ?? rs);
    } catch {
      /* logging is best-effort; the message still opens */
    }
  }

  if (!ready) return <p className="muted">Loading…</p>;
  // Type filter first (defines the audience), then sent/unsent.
  const audience = rows?.filter((r) => !typeFilter || String(r.vendor_type_id) === typeFilter) ?? [];
  const shown = audience.filter((r) => filter === 'all' || !r.last_sent);
  const sentCount = audience.filter((r) => r.last_sent).length;

  return (
    <>
      <h1>Notify vendors</h1>
      <p className="muted small">
        Tap <strong>Send</strong> to open WhatsApp with the message ready, then press send in WhatsApp. Only active vendors
        who opted in and have a phone number are listed.
      </p>

      <div className="card stack">
        <div>
          <label>Event</label>
          <select value={eventId} onChange={(e) => setEventId(e.target.value)}>
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.id} · {e.name} · {formatDateRange(e.start_date, e.end_date)} {e.status === 'draft' ? '(draft, not visible to vendors yet!)' : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>Message: placeholders {'{name} {business} {event} {date} {link}'}</label>
          <textarea value={template} onChange={(e) => setTemplate(e.target.value)} />
        </div>
        {rows?.[0] && (
          <div className="small">
            <span className="muted">Preview:</span>
            <div style={{ whiteSpace: 'pre-wrap', background: 'var(--bg)', padding: 10, borderRadius: 8, marginTop: 4 }}>
              {messageFor(rows[0])}
            </div>
          </div>
        )}
      </div>

      <div className="row" style={{ marginBottom: 8 }}>
        <label style={{ margin: 0 }}>Send to</label>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ width: 'auto' }}>
          <option value="">All vendor types</option>
          {types.map((t) => (
            <option key={t.id} value={t.id}>{t.name} only</option>
          ))}
        </select>
      </div>
      <div className="tabs">
        <button className={`tab${filter === 'unsent' ? ' active' : ''}`} onClick={() => setFilter('unsent')}>
          Not yet sent ({audience.length - sentCount})
        </button>
        <button className={`tab${filter === 'all' ? ' active' : ''}`} onClick={() => setFilter('all')}>
          All ({audience.length})
        </button>
      </div>

      <div className="card table-wrap">
        <table>
          <tbody>
            {shown.map((r) => {
              const href = waLink(r.phone, messageFor(r));
              return (
                <tr key={r.id}>
                  <td>
                    <strong>{r.business_name}</strong>
                    <div className="small muted">{[r.vendor_code, r.vendor_type?.name, r.contact_name].filter(Boolean).join(' · ')}</div>
                    {r.offerings && <div className="small muted" style={{ maxWidth: 360 }}>{r.offerings}</div>}
                  </td>
                  <td className="small">{r.phone}</td>
                  <td className="small muted">{r.last_sent ? `Sent ${formatDateTime(r.last_sent)}` : ''}</td>
                  <td className="right">
                    {href ? (
                      <a className="btn btn-sm btn-wa" href={href} target="_blank" rel="noreferrer" onClick={() => logSend(r)}>
                        {r.last_sent ? 'Send again' : 'Send'}
                      </a>
                    ) : (
                      <span className="small error">Invalid number</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows && shown.length === 0 && (
              <tr><td className="muted">{filter === 'unsent' ? 'Everyone has been notified for this event. 🎉' : 'No opted-in vendors.'}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
