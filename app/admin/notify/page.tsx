/**
 * /admin/notify — announce one or more events to vendors over WhatsApp.
 *
 * CONCEPT: tick the events to announce and write the message once using
 * placeholders. Each vendor row gets:
 *   - "Open & type": opens that vendor's chat with the personalised
 *     message already typed in; the admin just presses Enter. Where it opens
 *     is a choice remembered on this computer:
 *       app → the WhatsApp DESKTOP app via a whatsapp:// link: no browser
 *             tabs at all (recommended).
 *       web → WhatsApp Web. WhatsApp Web isolates its tab
 *             (Cross-Origin-Opener-Policy), which stops any website from
 *             re-using it, so each vendor opens a NEW tab. Unavoidable.
 *   - "Copy": puts the message on the clipboard instead, for pasting.
 * We never press Send ourselves: automating WhatsApp breaks its terms and
 * risks the number being banned. No API account or per-message fee.
 * Either button logs the send against EVERY ticked event, so each event's
 * list shows who's already been told about it.
 *
 * Two ways to send (see the "Broadcast list" card):
 *   - Broadcast (preferred, less likely to be flagged as spam): download the
 *     audience as contacts, import them into the business phone, build a
 *     broadcast list in WhatsApp Business, paste the copied message, then
 *     "Mark as notified" here. Broadcasts only reach vendors who have saved
 *     OUR number, which is why the vendor site has "Save our number" buttons.
 *   - One by one: the per-vendor Open & type / Copy buttons (personalised).
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
import { fillTemplate, formatDateRange, formatDateTime, siteOrigin, todayMYT, waAppLink, waLink, waWebLink } from '@/lib/util';
import { downloadText, vcardFile } from '@/lib/vcard';
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

/** WhatsApp broadcast lists hold at most 256 contacts each. */
const BROADCAST_MAX = 256;

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
  // "Copied!" feedback on the broadcast message button.
  const [copied, setCopied] = useState(false);
  // Which vendor row's message was just copied (for the "✓ Copied" flash).
  const [copiedRow, setCopiedRow] = useState<string | null>(null);
  // Vendors copied for during this visit: they stay on the "Not yet sent"
  // tab (greyed) so a row doesn't jump away the moment you copy it.
  const [doneHere, setDoneHere] = useState<Set<string>>(new Set());
  // Where "Open & type" opens chats: desktop app (default) or WhatsApp Web.
  // Remembered per computer; browser storage can be blocked, hence try/catch.
  const [openIn, setOpenIn] = useState<'app' | 'web'>('app');
  useEffect(() => {
    try {
      if (localStorage.getItem('notify_open_in') === 'web') setOpenIn('web');
    } catch {}
  }, []);
  const chooseOpenIn = (v: 'app' | 'web') => {
    setOpenIn(v);
    try {
      localStorage.setItem('notify_open_in', v);
    } catch {}
  };

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
    setDoneHere(new Set()); // new set of events → start a fresh "done" list
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

  /**
   * Copy one vendor's personalised message to the clipboard, then log it as
   * sent. If the browser blocks clipboard access, show it in a prompt box
   * to copy by hand.
   */
  async function copyFor(r: Row) {
    const msg = messageFor(r);
    try {
      await navigator.clipboard.writeText(msg);
    } catch {
      window.prompt(`Copy the message for ${r.business_name}:`, msg);
    }
    setCopiedRow(r.id);
    setDoneHere((d) => new Set(d).add(r.id));
    setTimeout(() => setCopiedRow((c) => (c === r.id ? null : c)), 2000);
    await logSend(r, msg);
  }

  /**
   * Open the vendor's chat with the message pre-typed.
   *   - Phone: wa.me hands over to the WhatsApp app.
   *   - Desktop app: a whatsapp:// link. Setting location to it launches the
   *     app; the browser stays on this page (no tab).
   *   - WhatsApp Web: a new tab (see the note at the top of this file).
   * window.open must run directly in the click handler or the pop-up
   * blocker steps in, so logging happens after.
   */
  function openFor(r: Row) {
    const msg = messageFor(r);
    const mobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
    if (mobile || openIn === 'app') {
      const url = mobile ? waLink(r.phone, msg) : waAppLink(r.phone, msg);
      if (!url) return;
      window.location.href = url;
    } else {
      const url = waWebLink(r.phone, msg);
      if (!url) return;
      window.open(url, '_blank');
    }
    setDoneHere((d) => new Set(d).add(r.id));
    void logSend(r, msg);
  }

  /** Log the send against every ticked event. */
  async function logSend(r: Row, msg: string) {
    try {
      const { sent_at } = await api<{ sent_at: string }>('/api/admin/notify', {
        method: 'POST',
        body: { event_ids: selected, vendor_id: r.id, message: msg },
      });
      const stamp = Object.fromEntries(selected.map((id) => [id, sent_at]));
      setRows((rs) => rs?.map((x) => (x.id === r.id ? { ...x, sent: { ...x.sent, ...stamp } } : x)) ?? rs);
    } catch {
      /* logging is best-effort; the message is already copied */
    }
  }

  if (!ready) return <p className="muted">Loading…</p>;
  // Type filter first (defines the audience), then sent/unsent.
  const audience = rows?.filter((r) => !typeFilter || String(r.vendor_type_id) === typeFilter) ?? [];
  const shown = audience.filter((r) => filter === 'all' || !toldAll(r) || doneHere.has(r.id));
  const sentCount = audience.filter(toldAll).length;
  // Broadcast targets: the vendors listed on the current tab with a usable number.
  const targets = shown.filter((r) => waLink(r.phone, '') && !(filter === 'unsent' && toldAll(r)));
  const typeName = types.find((t) => String(t.id) === typeFilter)?.name;

  /** The same text for everyone: a broadcast can't be personalised. */
  const broadcastText = fillTemplate(template, { ...eventValues, name: 'there', business: 'your stall' });

  /**
   * Download the broadcast targets as contact cards, split into files of
   * 256 (one file per broadcast list). Names start with "GVO ·" so they're
   * easy to find and tick when building the list in WhatsApp.
   */
  function downloadContacts() {
    const label = (typeName ?? 'all').replace(/[^\w]+/g, '-');
    const parts = Math.ceil(targets.length / BROADCAST_MAX);
    for (let i = 0; i < parts; i++) {
      const chunk = targets.slice(i * BROADCAST_MAX, (i + 1) * BROADCAST_MAX);
      const text = vcardFile(
        chunk.map((r) => ({
          name: `GVO · ${r.business_name}${r.contact_name ? ` (${r.contact_name})` : ''}`,
          phone: r.phone,
          org: r.business_name,
          categories: ['GVO vendor', ...(r.vendor_type ? [r.vendor_type.name] : [])],
          note: [r.vendor_code, r.offerings].filter(Boolean).join(' · ') || null,
        })),
      );
      const suffix = parts > 1 ? `-part${i + 1}of${parts}` : '';
      downloadText(`GVO-vendors-${label}-${todayMYT()}${suffix}.vcf`, text);
    }
  }

  /** Put the broadcast message on the clipboard. */
  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(broadcastText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy this message:', broadcastText);
    }
  }

  /** After sending the broadcast: log it for every target, for every ticked event. */
  async function markAllSent() {
    if (!targets.length) return;
    if (!window.confirm(`Mark ${targets.length} vendor(s) as notified about ${chosen.map((e) => e.name).join(' & ')}?`)) return;
    try {
      const { sent_at } = await api<{ sent_at: string }>('/api/admin/notify', {
        method: 'POST',
        body: { event_ids: selected, vendor_ids: targets.map((r) => r.id), message: broadcastText },
      });
      const ids = new Set(targets.map((r) => r.id));
      const stamp = Object.fromEntries(selected.map((id) => [id, sent_at]));
      setRows((rs) => rs?.map((x) => (ids.has(x.id) ? { ...x, sent: { ...x.sent, ...stamp } } : x)) ?? rs);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Could not save');
    }
  }

  return (
    <>
      <h1>Notify vendors</h1>
      <p className="muted small">
        Tap <strong>Open &amp; type</strong>: the vendor’s chat opens with the message already typed, just press{' '}
        <strong>Enter</strong> and come back for the next one. Either button marks the vendor as notified. Only active vendors
        who opted in and have a phone number are listed.
      </p>
      <div className="row small" style={{ marginBottom: 12 }}>
        <span className="muted">Open chats in:</span>
        <label className="check" style={{ margin: 0 }}>
          <input type="radio" name="openIn" checked={openIn === 'app'} onChange={() => chooseOpenIn('app')} /> WhatsApp desktop
          app (no tabs; first time, allow the browser to open it)
        </label>
        <label className="check" style={{ margin: 0 }}>
          <input type="radio" name="openIn" checked={openIn === 'web'} onChange={() => chooseOpenIn('web')} /> WhatsApp Web
          (opens a new tab each time; WhatsApp blocks tab re-use)
        </label>
      </div>

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

          {/* ---------- Broadcast list (preferred: one message, less spam risk) ---------- */}
          <div className="card stack">
            <strong>Send as a broadcast list</strong>
            <ol className="small" style={{ margin: 0, paddingLeft: 18 }}>
              <li>
                Download the {targets.length} vendor(s) on this tab as contacts and open the file on the business phone to
                import them. Each name starts with <em>GVO ·</em>.
                {targets.length > BROADCAST_MAX && <> Split into {Math.ceil(targets.length / BROADCAST_MAX)} files: a broadcast list holds max {BROADCAST_MAX}.</>}
              </li>
              <li>In WhatsApp Business: ⋮ → New broadcast, search “GVO”, tick the vendors.</li>
              <li>Copy the message below, paste it and send.</li>
              <li>Come back and press <strong>Mark as notified</strong>.</li>
            </ol>
            <p className="small muted" style={{ margin: 0 }}>
              Broadcasts only reach vendors who have saved <em>our</em> number. The vendor site has “Save our number”
              buttons; anyone who hasn’t done that can still be sent one by one below. A broadcast can’t be personalised, so{' '}
              {'{name}'} becomes “there”.
            </p>
            <div className="row">
              <button className="btn btn-sm" onClick={downloadContacts} disabled={!targets.length}>⬇ Download contacts (.vcf)</button>
              <button className="btn btn-sm" onClick={copyMessage}>{copied ? '✓ Copied' : '📋 Copy message'}</button>
              <button className="btn btn-sm btn-primary" onClick={markAllSent} disabled={!targets.length}>
                ✓ Mark {targets.length} as notified
              </button>
            </div>
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
                    <tr key={r.id} style={filter === 'unsent' && toldAll(r) ? { opacity: 0.45 } : undefined}>
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
                          <div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                            <button className="btn btn-sm btn-wa" onClick={() => openFor(r)}>
                              {toldAll(r) ? '💬 Open again' : '💬 Open & type'}
                            </button>
                            <button className="btn btn-sm" onClick={() => copyFor(r)} title="Copy the message to paste yourself">
                              {copiedRow === r.id ? '✓ Copied' : '📋 Copy'}
                            </button>
                          </div>
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
