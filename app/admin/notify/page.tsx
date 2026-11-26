/**
 * /admin/notify — announce one or more events to vendors over WhatsApp.
 *
 * CONCEPT: tick the events to announce and write the message once using
 * placeholders. Each vendor row gets a "Send" button that opens WhatsApp
 * with the personalised message pre-filled (wa.me link), using the
 * company's existing WhatsApp Business app. No API account or per-message
 * fee. Clicking also logs the send against EVERY ticked event, so each
 * event's list shows who's already been told about it.
 *
 * Placeholders:
 *   {name} {business}         the vendor
 *   {events}                  a bullet list: one line per ticked event with
 *                             its name, dates and booking link
 *   {event} {date} {link}     single-event wording; with several events
 *                             ticked these become "names joined with &",
 *                             "each event's dates", and the home page link
 */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRequireAuth } from '@/components/AuthProvider';
import { useVendorTypes } from '@/components/useVendorTypes';
import { api } from '@/lib/api';
import { fillTemplate, formatDateRange, formatDateTime, siteOrigin, waLink } from '@/lib/util';
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
  /** When this vendor was last messaged, per event id. */
  sent: Record<string, string>;
};

const DEFAULT_TEMPLATE =
  'Hi {name}! Stall bookings are now open for:\n{events}\n\nPick your spot at the links above. First come, first served!';

export default function AdminNotifyPage() {
  const { ready } = useRequireAuth('admin');
  const [events, setEvents] = useState<EventSummary[]>([]);
  // Ticked events, kept in date order (the order they appear in the message).
  const [selected, setSelected] = useState<string[]>([]);
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [filter, setFilter] = useState<'unsent' | 'all'>('unsent');
  // Vendor type filter: '' = everyone, else a type id (e.g. only Activities).
  const [typeFilter, setTypeFilter] = useState('');
  const types = useVendorTypes();

  // Load events once; pre-tick ?event= if we came from an event page,
  // otherwise the first upcoming one.
  useEffect(() => {
    if (!ready) return;
    api<{ events: EventSummary[] }>('/api/admin/events').then((r) => {
      const usable = r.events
        .filter((e) => e.status !== 'closed')
        .sort((a, b) => a.start_date.localeCompare(b.start_date));
      setEvents(usable);
      const pre = new URLSearchParams(window.location.search).get('event');
      const first = pre && usable.some((e) => e.id === pre) ? pre : usable[0]?.id;
      setSelected(first ? [first] : []);
    });
  }, [ready]);

  // Reload the vendor list + send history whenever the ticked set changes.
  const key = selected.join(',');
  const load = useCallback(() => {
    if (!key) return setRows(null);
    api<{ vendors: Row[] }>(`/api/admin/notify?event_ids=${key}`).then((r) => setRows(r.vendors));
  }, [key]);

  useEffect(() => {
    load();
  }, [load]);

  /** Tick/untick an event, keeping the list in date order. */
  const toggle = (id: string) =>
    setSelected((s) => {
      const next = s.includes(id) ? s.filter((x) => x !== id) : [...s, id];
      return events.filter((e) => next.includes(e.id)).map((e) => e.id);
    });

  const chosen = useMemo(() => events.filter((e) => selected.includes(e.id)), [events, selected]);
  const site = siteOrigin(); // tidied NEXT_PUBLIC_SITE_URL (see lib/util.ts)

  /**
   * Event-level placeholder values. These are the same for every vendor,
   * so they're worked out once per change of selection.
   */
  const eventValues = useMemo(() => {
    const dates = (e: EventSummary) => formatDateRange(e.start_date, e.end_date);
    const one = chosen.length === 1 ? chosen[0] : null;
    return {
      // WhatsApp shows *text* as bold.
      events: chosen.map((e) => `• *${e.name}* (${dates(e)}): ${site}/events/${e.id}`).join('\n'),
      event: chosen.map((e) => e.name).join(' & '),
      date: chosen.map(dates).join(' & '),
      link: one ? `${site}/events/${one.id}` : `${site}/`,
    };
  }, [chosen, site]);

  /** Personalise the template for one vendor. */
  const messageFor = (r: Row) =>
    fillTemplate(template, { ...eventValues, name: r.contact_name || r.business_name, business: r.business_name });

  /**
   * Has this vendor been told about every ticked event? A vendor told about
   * only some of them still counts as "not yet sent".
   */
  const toldAll = (r: Row) => selected.every((id) => r.sent[id]);
  /** Most recent send among the ticked events, for the "Sent …" note. */
  const lastSent = (r: Row) =>
    selected.map((id) => r.sent[id]).filter(Boolean).sort().pop() ?? null;

  /** Log the send against every ticked event. The <a> itself opens WhatsApp. */
  async function logSend(r: Row) {
    const msg = messageFor(r);
    try {
      const { sent_at } = await api<{ sent_at: string }>('/api/admin/notify', {
        method: 'POST',
        body: { event_ids: selected, vendor_id: r.id, message: msg },
      });
      const stamp = Object.fromEntries(selected.map((id) => [id, sent_at]));
      setRows((rs) => rs?.map((x) => (x.id === r.id ? { ...x, sent: { ...x.sent, ...stamp } } : x)) ?? rs);
    } catch {
      /* logging is best-effort; the message still opens */
    }
  }

  if (!ready) return <p className="muted">Loading…</p>;
  // Type filter first (defines the audience), then sent/unsent.
  const audience = rows?.filter((r) => !typeFilter || String(r.vendor_type_id) === typeFilter) ?? [];
  const shown = audience.filter((r) => filter === 'all' || !toldAll(r));
  const sentCount = audience.filter(toldAll).length;

  return (
    <>
      <h1>Notify vendors</h1>
      <p className="muted small">
        Tap <strong>Send</strong> to open WhatsApp with the message ready, then press send in WhatsApp. Only active vendors
        who opted in and have a phone number are listed.
      </p>

      <div className="card stack">
        <div>
          <label>Events to announce: tick one or more</label>
          <div className="stack" style={{ gap: 4, marginTop: 4 }}>
            {events.map((e) => (
              <label key={e.id} className="check" style={{ margin: 0 }}>
                <input type="checkbox" checked={selected.includes(e.id)} onChange={() => toggle(e.id)} />
                <span>
                  {e.id} · {e.name} · {formatDateRange(e.start_date, e.end_date)}
                  {e.status === 'draft' && <span className="small error"> (draft, not visible to vendors yet!)</span>}
                </span>
              </label>
            ))}
            {events.length === 0 && <span className="muted small">No upcoming events.</span>}
          </div>
        </div>
        <div>
          <label>
            Message: placeholders {'{name} {business} {events}'}
            <span className="muted"> (list of the ticked events with links)</span>, or {'{event} {date} {link}'}
          </label>
          <textarea value={template} onChange={(e) => setTemplate(e.target.value)} style={{ minHeight: 110 }} />
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

      {selected.length > 0 && (
        <>
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
                  const last = lastSent(r);
                  // Told about some ticked events but not all: say which.
                  const partial = !toldAll(r) && last ? chosen.filter((e) => r.sent[e.id]).map((e) => e.name) : null;
                  return (
                    <tr key={r.id}>
                      <td>
                        <strong>{r.business_name}</strong>
                        <div className="small muted">{[r.vendor_code, r.vendor_type?.name, r.contact_name].filter(Boolean).join(' · ')}</div>
                        {r.offerings && <div className="small muted" style={{ maxWidth: 360 }}>{r.offerings}</div>}
                      </td>
                      <td className="small">{r.phone}</td>
                      <td className="small muted">
                        {partial ? `Already told about ${partial.join(', ')}` : last ? `Sent ${formatDateTime(last)}` : ''}
                      </td>
                      <td className="right">
                        {href ? (
                          <a className="btn btn-sm btn-wa" href={href} target="_blank" rel="noreferrer" onClick={() => logSend(r)}>
                            {toldAll(r) ? 'Send again' : 'Send'}
                          </a>
                        ) : (
                          <span className="small error">Invalid number</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {rows && shown.length === 0 && (
                  <tr>
                    <td className="muted">
                      {filter === 'unsent' ? 'Everyone has been notified about these events. 🎉' : 'No opted-in vendors.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
