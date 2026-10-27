/**
 * /admin/events/[id]/documents — invoices & receipts for one event.
 *
 * CONCEPT: every vendor with stalls in the event appears as a row (one per
 * online booking, plus one per vendor for stalls assigned manually). From
 * here an admin can:
 *   - issue missing invoices / receipts, one row at a time or in bulk
 *     (useful for vendors already in an event before invoicing existed);
 *   - open the PDF, or WhatsApp the vendor a link to it;
 *   - correct a document's number, date or bill-to details.
 * Online bookings also get documents automatically (invoice at checkout,
 * receipt when payment is confirmed); this screen just fills the gaps.
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRequireAuth } from '@/components/AuthProvider';
import { api } from '@/lib/api';
import { BOOKING_STATUS_LABEL, documentUrl, formatDateRange, rm, todayMYT, waLink } from '@/lib/util';
import type { DocGroupRow, DocumentRow, DocumentSummary, EventRow } from '@/lib/types';

type Payload = { event: EventRow; groups: DocGroupRow[]; voided: DocumentSummary[]; errors?: string[] };

export default function EventDocumentsPage({ params }: { params: { id: string } }) {
  const { ready } = useRequireAuth('admin');
  const [data, setData] = useState<Payload | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null); // document id being edited
  // Date printed on newly issued documents; change it to backdate a past event's paperwork.
  const [issueDate, setIssueDate] = useState(todayMYT());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);

  const load = useCallback(() => {
    api<Payload>(`/api/admin/events/${params.id}/documents`)
      .then(setData)
      .catch((e: Error) => setMsg({ text: e.message, error: true }));
  }, [params.id]);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  /** Issue invoices or receipts for the given rows, then show the result. */
  async function issue(action: 'invoice' | 'receipt', rows: DocGroupRow[]) {
    if (!rows.length) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<Payload>(`/api/admin/events/${params.id}/documents`, {
        method: 'POST',
        body: { action, issued_on: issueDate, groups: rows.map((g) => ({ vendor_id: g.vendor.id, booking_id: g.booking_id })) },
      });
      setData(r);
      setSelected(new Set());
      setMsg(
        r.errors?.length
          ? { text: `Done, with problems:\n${r.errors.join('\n')}`, error: true }
          : { text: action === 'invoice' ? 'Invoices issued.' : 'Receipts issued.' },
      );
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'Failed', error: true });
    } finally {
      setBusy(false);
    }
  }

  if (!ready || !data) return <p className={msg?.error ? 'error' : 'muted'}>{msg?.text ?? 'Loading…'}</p>;
  const { event, groups } = data;

  // Rows the bulk buttons would act on: the selection, or everything.
  const scope = selected.size ? groups.filter((g) => selected.has(g.key)) : groups;
  const needInvoice = scope.filter((g) => !g.invoice);
  const needReceipt = scope.filter((g) => !g.receipt && g.can_receipt);
  const origin = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;

  /** WhatsApp text with the most relevant document (receipt if issued, else invoice). */
  const waMessage = (g: DocGroupRow) => {
    const d = g.receipt ?? g.invoice;
    const name = g.vendor.contact_name || g.vendor.business_name;
    const what = g.receipt ? 'official receipt' : 'invoice';
    return `Hi ${name}, here is your ${what} for ${event.name} (${formatDateRange(event.start_date, event.end_date)}), booth ${g.stalls
      .map((s) => s.stall_no)
      .join(', ')}:\n${d ? `${d.number}: ${documentUrl(d.access_token, origin)}` : ''}\nThank you!`;
  };

  const toggle = (key: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  return (
    <>
      <div className="spread">
        <div>
          <div className="small muted">
            {formatDateRange(event.start_date, event.end_date)} · Event {event.id}
            {event.venue && <> · {event.venue}</>}
          </div>
          <h1 style={{ marginTop: 4 }}>Invoices &amp; receipts: {event.name}</h1>
        </div>
        <Link href={`/admin/events/${event.id}`} className="btn btn-sm">← Event map</Link>
      </div>

      <p className="small muted">
        Numbering: next invoice is <strong>{event.doc_prefix ?? '(set on event page)'}-{String(event.doc_next_no).padStart(5, '0')}</strong>;
        receipts use the invoice number + R. Change the prefix, starting number or venue on the{' '}
        <Link href={`/admin/events/${event.id}`}>event page</Link> before issuing.
        {!event.venue && <span className="error"> No venue set yet: invoices won’t mention where the event is.</span>}
      </p>

      {msg && <p className={`card small ${msg.error ? 'error' : 'success'}`} style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</p>}

      <div className="row" style={{ marginBottom: 12 }}>
        <label className="small" style={{ margin: 0 }}>Issue date</label>
        <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value || todayMYT())} style={{ width: 'auto' }} />
        {issueDate !== todayMYT() && <span className="small muted">(backdated)</span>}
        <span className="small muted">{selected.size ? `${selected.size} selected:` : 'All vendors:'}</span>
        <button className="btn btn-primary btn-sm" disabled={busy || !needInvoice.length} onClick={() => issue('invoice', needInvoice)}>
          Issue {needInvoice.length} missing invoice{needInvoice.length === 1 ? '' : 's'}
        </button>
        <button className="btn btn-ok btn-sm" disabled={busy || !needReceipt.length} onClick={() => issue('receipt', needReceipt)}>
          Issue {needReceipt.length} receipt{needReceipt.length === 1 ? '' : 's'} (paid)
        </button>
        {selected.size > 0 && <button className="btn btn-sm" onClick={() => setSelected(new Set())}>Clear selection</button>}
      </div>

      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 1 }}>
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={selected.size === groups.length && groups.length > 0}
                  onChange={(e) => setSelected(e.target.checked ? new Set(groups.map((g) => g.key)) : new Set())}
                />
              </th>
              <th>Booth</th><th>Vendor</th><th>Source</th><th className="right">Total</th><th>Invoice</th><th>Receipt</th><th></th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => {
              const wa = (g.invoice || g.receipt) && waLink(g.vendor.phone, waMessage(g));
              return (
                <GroupRows
                  key={g.key}
                  g={g}
                  checked={selected.has(g.key)}
                  onToggle={() => toggle(g.key)}
                  busy={busy}
                  editing={editing}
                  setEditing={setEditing}
                  onIssue={(action) => issue(action, [g])}
                  onSaved={() => {
                    setEditing(null);
                    load();
                  }}
                  wa={wa || null}
                />
              );
            })}
            {groups.length === 0 && (
              <tr><td colSpan={8} className="muted">No vendors have stalls in this event yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {data.voided.length > 0 && (
        <details className="card">
          <summary className="small">Voided documents ({data.voided.length})</summary>
          <div className="row" style={{ marginTop: 8 }}>
            {data.voided.map((d) => (
              <a key={d.id} className="btn btn-sm" href={documentUrl(d.access_token)} target="_blank" rel="noreferrer" style={{ textDecoration: 'line-through' }}>
                {d.number}
              </a>
            ))}
          </div>
        </details>
      )}
    </>
  );
}

/** One vendor group: the main row, plus an edit row when a document is being edited. */
function GroupRows(props: {
  g: DocGroupRow;
  checked: boolean;
  onToggle: () => void;
  busy: boolean;
  editing: string | null;
  setEditing: (id: string | null) => void;
  onIssue: (action: 'invoice' | 'receipt') => void;
  onSaved: () => void;
  wa: string | null;
}) {
  const { g, editing } = props;
  const editingDoc = [g.invoice, g.receipt].find((d) => d && d.id === editing) ?? null;

  /** A document cell: link + edit, or a button to create it. */
  const docCell = (d: DocumentSummary | null, kind: 'invoice' | 'receipt') => {
    if (d) {
      return (
        <span className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
          <a href={documentUrl(d.access_token)} target="_blank" rel="noreferrer">{d.number}</a>
          <button className="btn btn-sm" title="Edit" onClick={() => props.setEditing(editing === d.id ? null : d.id)}>✎</button>
        </span>
      );
    }
    if (kind === 'receipt' && !g.can_receipt) return <span className="small muted">Awaiting payment</span>;
    return (
      <button className={`btn btn-sm ${kind === 'receipt' ? 'btn-ok' : ''}`} disabled={props.busy} onClick={() => props.onIssue(kind)}>
        Issue {kind}
      </button>
    );
  };

  return (
    <>
      <tr>
        <td><input type="checkbox" checked={props.checked} onChange={props.onToggle} aria-label={`Select ${g.vendor.business_name}`} /></td>
        <td>{g.stalls.map((s) => s.stall_no).join(', ')}</td>
        <td>
          <Link href={`/admin/vendors/${g.vendor.id}`}>{g.vendor.business_name}</Link>
          <div className="small muted">{g.vendor.vendor_code}</div>
        </td>
        <td className="small">
          {g.booking_id ? (
            <Link href={`/admin/bookings?focus=${g.booking_id}`}>
              #{g.booking_ref} · {BOOKING_STATUS_LABEL[g.booking_status ?? ''] ?? g.booking_status}
            </Link>
          ) : (
            'Assigned manually'
          )}
        </td>
        <td className="right">{rm(g.total)}</td>
        <td>{docCell(g.invoice, 'invoice')}</td>
        <td>{docCell(g.receipt, 'receipt')}</td>
        <td>{props.wa && <a className="btn btn-sm btn-wa" href={props.wa} target="_blank" rel="noreferrer">WhatsApp</a>}</td>
      </tr>
      {editingDoc && (
        <tr>
          <td colSpan={8} style={{ background: 'var(--bg)' }}>
            <EditDocument docId={editingDoc.id} onDone={props.onSaved} onCancel={() => props.setEditing(null)} />
          </td>
        </tr>
      )}
    </>
  );
}

/**
 * Inline editor for an issued document: number, date, bill-to. Loads the
 * full document first so the current values are pre-filled.
 */
function EditDocument({ docId, onDone, onCancel }: { docId: string; onDone: () => void; onCancel: () => void }) {
  const [doc, setDoc] = useState<DocumentRow | null>(null);
  const [form, setForm] = useState({
    number: '',
    issued_on: '',
    bill_to_name: '',
    bill_to_address: '',
    refresh_lines: false,
    refresh_bill_to: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Load the full document to pre-fill the form.
  useEffect(() => {
    api<{ document: DocumentRow }>(`/api/admin/documents/${docId}`)
      .then(({ document: d }) => {
        setDoc(d);
        setForm({
          number: d.number,
          issued_on: d.issued_on,
          bill_to_name: d.bill_to_name,
          bill_to_address: d.bill_to_address ?? '',
          refresh_lines: false,
          refresh_bill_to: false,
        });
      })
      .catch((e: Error) => setError(e.message));
  }, [docId]);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/admin/documents/${docId}`, { method: 'PATCH', body: form });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
      setBusy(false);
    }
  }

  if (!doc) return <p className={error ? 'error small' : 'muted small'}>{error ?? 'Loading…'}</p>;
  return (
    <div className="stack">
      <div className="grid">
        <div>
          <label>{doc.kind === 'invoice' ? 'Invoice' : 'Receipt'} number</label>
          <input value={form.number} onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))} />
        </div>
        <div>
          <label>Date</label>
          <input type="date" value={form.issued_on} onChange={(e) => setForm((f) => ({ ...f, issued_on: e.target.value }))} />
        </div>
        <div>
          <label>{doc.kind === 'invoice' ? 'Bill to' : 'Paid by'}</label>
          <input value={form.bill_to_name} onChange={(e) => setForm((f) => ({ ...f, bill_to_name: e.target.value }))} />
        </div>
      </div>
      <div>
        <label>Address (optional; left off the document when empty)</label>
        <textarea
          style={{ minHeight: 70 }}
          value={form.bill_to_address}
          disabled={form.refresh_bill_to}
          onChange={(e) => setForm((f) => ({ ...f, bill_to_address: e.target.value }))}
        />
      </div>
      <label className="check">
        <input type="checkbox" checked={form.refresh_bill_to} onChange={(e) => setForm((f) => ({ ...f, refresh_bill_to: e.target.checked }))} />
        Use the vendor’s current name &amp; address from their vendor record (overrides the boxes above)
      </label>
      <label className="check">
        <input type="checkbox" checked={form.refresh_lines} onChange={(e) => setForm((f) => ({ ...f, refresh_lines: e.target.checked }))} />
        Update line wording from current event details (name, venue, dates). Prices stay the same.
      </label>
      {error && <p className="error small">{error}</p>}
      <div className="row">
        <button className="btn btn-primary btn-sm" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
        <button className="btn btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
