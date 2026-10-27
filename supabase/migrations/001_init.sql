-- =============================================================================
-- 001_init.sql — Stall booking system schema
--
-- Run this once in the Supabase SQL editor (or via `supabase db push`).
--
-- CORE CONCEPT
-- ------------
--   layouts / layout_stalls  = the MASTER floor plan (every stall that can ever
--                              exist, with its x/y position on the map).
--   events / event_stalls    = a COPY of the master plan for one event date.
--                              Each event_stall row carries that event's price,
--                              power budget, status and (once booked) vendor.
--   bookings / booking_items = a vendor's checkout ("cart"), which can span
--                              many stalls across many events. Paid by manual
--                              bank transfer, confirmed by an admin.
--
-- Stall status lifecycle (event_stalls.status):
--   available ──(vendor checks out)──▶ held ──(admin confirms payment)──▶ booked
--       ▲                               │
--       └──(hold expires / rejected)────┘
--   blocked = greyed out by admin for this event (not offered for sale)
--
-- All access goes through server routes using the SECRET (service-role) key,
-- which bypasses RLS. 003_lockdown.sql enables RLS with no policies so the
-- public/publishable key can't touch these tables directly.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- VENDORS — the client list managed on the admin "Vendors" screen.
-- A vendor row may exist without a login (admin-created). When that vendor
-- later signs up with the same email, /api/me links the login to the row.
-- -----------------------------------------------------------------------------
create table if not exists vendors (
  id              uuid primary key default gen_random_uuid(),
  auth_user_id    uuid unique references auth.users(id) on delete set null,
  business_name   text not null,
  contact_name    text,
  phone           text,              -- WhatsApp number, stored as typed
  email           text,
  category        text,              -- e.g. 'Food', 'Crafts', 'Clothing'
  notes           text,              -- internal admin notes (never shown to vendor)
  whatsapp_opt_in boolean not null default true,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);
create index if not exists vendors_email_idx on vendors (lower(email));

-- -----------------------------------------------------------------------------
-- ADMINS — which logins may use /admin. Add rows manually (see README).
-- -----------------------------------------------------------------------------
create table if not exists admins (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  name         text,
  created_at   timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- SETTINGS — single-row table (id = 1) for bank details and hold duration.
-- -----------------------------------------------------------------------------
create table if not exists settings (
  id                int primary key default 1 check (id = 1),
  hold_hours        int not null default 48,   -- unpaid holds auto-release after this
  bank_name         text,
  bank_account_name text,
  bank_account_no   text,
  payment_note      text,                      -- extra instructions shown at payment
  updated_at        timestamptz not null default now()
);
insert into settings (id) values (1) on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- LAYOUTS — master floor plans. `blocks` holds the non-bookable shapes drawn
-- on the map (shop lots, escalators) as [{label,x,y,w,h}].
-- Coordinates are in the pixel space of the original layout image.
-- -----------------------------------------------------------------------------
create table if not exists layouts (
  id         text primary key,
  name       text not null,
  width      int  not null,
  height     int  not null,
  blocks     jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists layout_stalls (
  layout_id  text not null references layouts(id) on delete cascade,
  stall_no   text not null,                 -- '1', '3A', '13A' …
  x int not null, y int not null, w int not null, h int not null,
  sort_order int not null default 0,
  primary key (layout_id, stall_no)
);

-- -----------------------------------------------------------------------------
-- EVENTS — one row per event date. id is the date as YYMMDD (e.g. '261115').
-- status: draft (admins only) → open (vendors can book) → closed.
-- -----------------------------------------------------------------------------
create table if not exists events (
  id         text primary key check (id ~ '^[0-9]{6}$'),
  name       text not null,
  event_date date not null,
  layout_id  text not null references layouts(id),
  status     text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  notes      text,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- BOOKINGS — a vendor checkout. Totals are snapshotted from event_stalls at
-- checkout time so later price edits don't change what the vendor owes.
-- status: pending_payment → payment_submitted (receipt uploaded)
--         → confirmed | cancelled | expired
-- -----------------------------------------------------------------------------
create table if not exists bookings (
  id           uuid primary key default gen_random_uuid(),
  ref          text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 8)),
  vendor_id    uuid not null references vendors(id),
  status       text not null default 'pending_payment'
               check (status in ('pending_payment', 'payment_submitted', 'confirmed', 'cancelled', 'expired')),
  total        numeric(10, 2) not null default 0,
  receipt_path text,                    -- object path in the 'payment-receipts' bucket
  expires_at   timestamptz,             -- hold deadline while pending_payment
  admin_note   text,
  created_at   timestamptz not null default now(),
  confirmed_at timestamptz
);
create index if not exists bookings_vendor_idx on bookings (vendor_id, created_at desc);
create index if not exists bookings_status_idx on bookings (status);

create table if not exists booking_items (
  booking_id uuid not null references bookings(id) on delete cascade,
  event_id   text not null references events(id),
  stall_no   text not null,
  price      numeric(10, 2) not null,
  primary key (booking_id, event_id, stall_no)
);

-- -----------------------------------------------------------------------------
-- EVENT_STALLS — the per-event copy of each layout stall.
-- (event id, stall number, vendor id, rental price, power budget, status)
-- -----------------------------------------------------------------------------
create table if not exists event_stalls (
  event_id        text not null references events(id) on delete cascade,
  stall_no        text not null,
  vendor_id       uuid references vendors(id),
  price           numeric(10, 2) not null default 0,
  power_watts     int not null default 0,
  status          text not null default 'available'
                  check (status in ('available', 'held', 'booked', 'blocked')),
  booking_id      uuid references bookings(id) on delete set null,
  hold_expires_at timestamptz,
  primary key (event_id, stall_no)
);
create index if not exists event_stalls_booking_idx on event_stalls (booking_id);

-- -----------------------------------------------------------------------------
-- NOTIFICATION_LOG — record of WhatsApp messages sent from the Notify screen,
-- so admins can see who has already been told about an event.
-- -----------------------------------------------------------------------------
create table if not exists notification_log (
  id         bigint generated always as identity primary key,
  event_id   text references events(id) on delete cascade,
  vendor_id  uuid references vendors(id) on delete cascade,
  channel    text not null default 'whatsapp_link',
  message    text not null,
  created_at timestamptz not null default now()
);
create index if not exists notification_log_event_idx on notification_log (event_id, vendor_id);

-- -----------------------------------------------------------------------------
-- STORAGE — private bucket for bank transfer receipts (images / PDFs).
-- Files are only ever read through short-lived signed URLs from admin routes.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('payment-receipts', 'payment-receipts', false)
on conflict (id) do nothing;

-- =============================================================================
-- FUNCTIONS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- expire_stale_holds()
-- CONCEPT: "lazy expiry". Instead of a background job, every read/write path
-- that cares about availability calls this first. It marks overdue unpaid
-- bookings as 'expired' and frees their stalls in one statement.
-- Bookings with an uploaded receipt (payment_submitted) never auto-expire —
-- they wait for an admin decision.
-- -----------------------------------------------------------------------------
create or replace function expire_stale_holds() returns void
language plpgsql as $$
begin
  with expired as (
    update bookings
       set status = 'expired'
     where status = 'pending_payment'
       and expires_at < now()
    returning id
  )
  update event_stalls
     set status = 'available', vendor_id = null, booking_id = null, hold_expires_at = null
   where status = 'held'
     and booking_id in (select id from expired);
end $$;

-- -----------------------------------------------------------------------------
-- create_booking(vendor, items)
-- CONCEPT: the "cinema seat" guarantee. All requested stalls are row-locked
-- (SELECT … FOR UPDATE) inside one transaction, re-checked, and only then
-- flipped to 'held'. Two vendors clicking the same stall at the same moment
-- are serialised by the lock: the second one sees status='held' and fails.
-- It is all-or-nothing: if ANY stall is unavailable, nothing is held.
--
-- p_items: [{"event_id":"261115","stall_no":"3A"}, …]
-- Raises 'STALL_UNAVAILABLE:<event>/<stall>,…' so the API can tell the vendor
-- exactly which stalls were taken.
-- -----------------------------------------------------------------------------
create or replace function create_booking(p_vendor_id uuid, p_items jsonb) returns uuid
language plpgsql as $$
declare
  v_booking     uuid;
  v_hold_hours  int;
  v_unavailable text;
begin
  perform expire_stale_holds();

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'EMPTY_CART';
  end if;

  -- Normalise the request into a temp table (deduplicated) for easy joins.
  create temp table if not exists _req (event_id text, stall_no text) on commit drop;
  truncate _req;
  insert into _req
  select distinct x->>'event_id', x->>'stall_no'
    from jsonb_array_elements(p_items) x;

  -- Lock every requested stall row so concurrent checkouts queue up here.
  perform 1
     from event_stalls s
     join _req r on r.event_id = s.event_id and r.stall_no = s.stall_no
      for update of s;

  -- Re-check availability AFTER acquiring the locks.
  select string_agg(r.event_id || '/' || r.stall_no, ',')
    into v_unavailable
    from _req r
    left join event_stalls s on s.event_id = r.event_id and s.stall_no = r.stall_no
    left join events e       on e.id = r.event_id
   where s.event_id is null           -- stall doesn't exist for that event
      or s.status <> 'available'      -- held / booked / blocked
      or e.status <> 'open'           -- event not open for booking
      or e.event_date < (now() at time zone 'Asia/Kuala_Lumpur')::date;

  if v_unavailable is not null then
    raise exception 'STALL_UNAVAILABLE:%', v_unavailable;
  end if;

  v_hold_hours := coalesce((select hold_hours from settings where id = 1), 48);

  -- Create the booking header…
  insert into bookings (vendor_id, status, expires_at)
  values (p_vendor_id, 'pending_payment', now() + make_interval(hours => v_hold_hours))
  returning id into v_booking;

  -- …snapshot each stall's current price as a line item…
  insert into booking_items (booking_id, event_id, stall_no, price)
  select v_booking, s.event_id, s.stall_no, s.price
    from event_stalls s
    join _req r on r.event_id = s.event_id and r.stall_no = s.stall_no;

  update bookings
     set total = (select coalesce(sum(price), 0) from booking_items where booking_id = v_booking)
   where id = v_booking;

  -- …and finally mark the stalls as held for this vendor.
  update event_stalls s
     set status = 'held',
         vendor_id = p_vendor_id,
         booking_id = v_booking,
         hold_expires_at = (select expires_at from bookings where id = v_booking)
    from _req r
   where r.event_id = s.event_id and r.stall_no = s.stall_no;

  return v_booking;
end $$;

-- -----------------------------------------------------------------------------
-- admin_booking_action(booking, action)
-- CONCEPT: one place that keeps bookings and event_stalls in sync.
--   'confirm' → booking confirmed, its held stalls become 'booked'
--   'cancel'  → booking cancelled, its stalls released back to 'available'
-- Only stalls still pointing at this booking are touched, so an expired
-- booking whose stalls were re-sold can't clobber the new owner.
-- -----------------------------------------------------------------------------
create or replace function admin_booking_action(p_booking_id uuid, p_action text, p_note text default null)
returns void
language plpgsql as $$
declare
  v_status text;
begin
  select status into v_status from bookings where id = p_booking_id for update;
  if v_status is null then
    raise exception 'BOOKING_NOT_FOUND';
  end if;

  if p_action = 'confirm' then
    if v_status not in ('pending_payment', 'payment_submitted') then
      raise exception 'INVALID_STATE:%', v_status;
    end if;
    update bookings
       set status = 'confirmed', confirmed_at = now(), admin_note = coalesce(p_note, admin_note)
     where id = p_booking_id;
    update event_stalls
       set status = 'booked', hold_expires_at = null
     where booking_id = p_booking_id;

  elsif p_action = 'cancel' then
    if v_status in ('cancelled', 'expired') then
      raise exception 'INVALID_STATE:%', v_status;
    end if;
    update bookings
       set status = 'cancelled', admin_note = coalesce(p_note, admin_note)
     where id = p_booking_id;
    update event_stalls
       set status = 'available', vendor_id = null, booking_id = null, hold_expires_at = null
     where booking_id = p_booking_id;

  else
    raise exception 'UNKNOWN_ACTION:%', p_action;
  end if;
end $$;
