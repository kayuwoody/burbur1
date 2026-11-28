-- =============================================================================
-- 014_vendor_flags.sql — admin flags on vendors:
--   1. "Interested in event X": a vendor said they'd like a stall at an event
--      (before booking). One row per (vendor, event).
--   2. "Follow up": a to-do flag on the vendor with an optional note
--      (e.g. "call back Monday", "send floor plan").
--
-- CONCEPT: both are admin-only notes for chasing vendors. They don't hold or
-- reserve anything; bookings still go through create_booking().
-- Shown and edited on Admin → Notify (per vendor row) and on the vendor's
-- details page. Safe to run more than once.
-- =============================================================================

-- 1. Interest per event --------------------------------------------------------
create table if not exists vendor_event_interest (
  vendor_id  uuid not null references vendors(id) on delete cascade,
  event_id   text not null references events(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (vendor_id, event_id)
);
-- "Who is interested in this event?" lookups.
create index if not exists vendor_event_interest_event_idx on vendor_event_interest (event_id);

-- Same lockdown as every other table (003_lockdown.sql): RLS on with no
-- policies, so only the server's secret key can read or write it.
alter table vendor_event_interest enable row level security;

-- 2. Follow-up flag on the vendor ---------------------------------------------
alter table vendors
  add column if not exists follow_up      boolean not null default false,
  add column if not exists follow_up_note text,
  add column if not exists follow_up_at   timestamptz;  -- when it was flagged
