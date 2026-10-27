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
import { api } from '@/lib/api';
import { fillTemplate, formatDate, formatDateTime, waLink } from '@/lib/util';
import type { EventSummary } from '@/lib/types';

type Row = { id: string; business_name: string; contact_name: string | null; phone: string | null; category: string | null; last_sent: string | null };

const DEFAULT_TEMPLATE =
  'Hi {name}! Stall bookings for *{event}* on {date} are now open. Pick your spot here: {link}\n\nFirst come, first served!';

export default function AdminNotifyPage() {
  const { ready } = useRequireAuth('admin');
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [eventId, setEventId] = useState('');
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [filter, setFilter] = useState<'unsent' | 'all'>('unsent');

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
      date: event ? formatDate(event.event_date) : '',
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
  const shown = rows?.filter((r) => filter === 'all' || !r.last_sent) ?? [];
  const sentCount = rows?.filter((r) => r.last_sent).length ?? 0;

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
                {e.id} · {e.name} · {formatDate(e.event_date)} {e.status === 'draft' ? '(draft, not visible to vendors yet!)' : ''}
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

      <div className="tabs">
        <button className={`tab${filter === 'unsent' ? ' active' : ''}`} onClick={() => setFilter('unsent')}>
          Not yet sent ({(rows?.length ?? 0) - sentCount})
        </button>
        <button className={`tab${filter === 'all' ? ' active' : ''}`} onClick={() => setFilter('all')}>
          All ({rows?.length ?? 0})
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
                    <div className="small muted">{[r.contact_name, r.category].filter(Boolean).join(' · ')}</div>
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
