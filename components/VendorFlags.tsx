/**
 * components/VendorFlags.tsx — admin flags on a vendor (admin pages only).
 *
 *   ✓ Vendor / ⏳ Held: the vendor already has stalls at that event (booked
 *     online or assigned by us; "held" = online booking awaiting payment).
 *     Read-only: it follows the bookings automatically.
 *   ★ Interested: one toggle chip per event offered. Ticking it records that
 *     the vendor said they'd like a stall at that event. Hidden for events
 *     they already have a stall at.
 *   📌 Follow up: a to-do flag with an optional note ("call back Monday").
 *
 * CONCEPT: the same component sits on each Admin → Notify row (compact) and
 * on the vendor details page (full), so both show and edit the same data via
 * /api/admin/vendors/[id]/flags. It saves on each click and hands the saved
 * result to `onChange`, so the parent can update its lists/counts.
 */
'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/util';

export type Flags = {
  interests: string[];
  /** Events they have stalls at (derived from bookings/assignments). */
  vendor_of: { event_id: string; status: 'booked' | 'held'; stalls: string[] }[];
  follow_up: boolean;
  follow_up_note: string | null;
  follow_up_at: string | null;
};

/** Short label for an event chip: name, plus dates when not compact. */
type EventLite = { id: string; name: string };

export default function VendorFlags({
  vendorId,
  vendorName,
  flags,
  events,
  onChange,
  compact = false,
}: {
  vendorId: string;
  vendorName: string;
  flags: Flags;
  /** Events to offer as interest chips (e.g. the ticked ones on Notify). */
  events: EventLite[];
  onChange: (flags: Flags) => void;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState(false);

  /** Send one change, then report the saved flags back to the parent. */
  async function save(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const r = await api<{ flags: Flags }>(`/api/admin/vendors/${vendorId}/flags`, { method: 'PATCH', body });
      onChange(r.flags);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  }

  /** Turn follow-up on (asking for an optional note) or off. */
  function toggleFollowUp() {
    if (flags.follow_up) return save({ follow_up: false });
    const note = window.prompt(`Follow up with ${vendorName}: add a note (optional)`, '');
    if (note === null) return; // cancelled
    save({ follow_up: true, note });
  }

  /** Edit the note of an existing follow-up. */
  function editNote() {
    const note = window.prompt(`Follow-up note for ${vendorName}`, flags.follow_up_note ?? '');
    if (note === null) return;
    save({ follow_up: true, note });
  }

  return (
    <div className="flags" style={{ opacity: busy ? 0.6 : 1 }}>
      {events.map((e) => {
        // Already has a stall here: show that instead of the interest toggle.
        const of = flags.vendor_of.find((v) => v.event_id === e.id);
        if (of) {
          const name = compact && events.length === 1 ? '' : `${e.name} `;
          return (
            <span
              key={e.id}
              className={`flag-chip vendor${of.status === 'held' ? ' held' : ''}`}
              title={of.status === 'held' ? 'Booked online, waiting for payment' : 'Has a stall at this event'}
            >
              {of.status === 'held' ? '⏳ Held' : '✓ Vendor'}: {name}
              {of.stalls.length > 1 ? 'stalls' : 'stall'} {of.stalls.join(', ')}
            </span>
          );
        }
        const on = flags.interests.includes(e.id);
        return (
          <button
            key={e.id}
            type="button"
            className={`flag-chip${on ? ' on' : ''}`}
            disabled={busy}
            aria-pressed={on}
            title={on ? 'Interested: click to remove' : 'Mark as interested in this event'}
            onClick={() => save({ interest: { event_id: e.id, on: !on } })}
          >
            {on ? '★' : '☆'} {compact && events.length === 1 ? 'Interested' : e.name}
          </button>
        );
      })}
      <button
        type="button"
        className={`flag-chip follow${flags.follow_up ? ' on' : ''}`}
        disabled={busy}
        aria-pressed={flags.follow_up}
        title={flags.follow_up ? 'Done following up: click to clear' : 'Flag for follow-up'}
        onClick={toggleFollowUp}
      >
        📌 {flags.follow_up ? 'Follow up' : 'Follow up?'}
      </button>
      {flags.follow_up && (
        <button type="button" className="link-btn small" onClick={editNote} disabled={busy} title="Edit the note">
          {flags.follow_up_note ? `“${flags.follow_up_note}”` : 'add note'}
          {!compact && flags.follow_up_at && <span className="muted"> · since {formatDateTime(flags.follow_up_at)}</span>}
        </button>
      )}
    </div>
  );
}
