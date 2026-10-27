-- =============================================================================
-- 004_event_date_range.sql — events run from a start date to an end date.
--
-- CONCEPT: an event can span several days, even across months
-- (e.g. 28 Nov → 6 Dec). The event id stays the YYMMDD of the START date.
-- A booking covers the stall for the whole event (all days).
--
--   events.event_date → renamed to start_date
--   events.end_date   → new; defaults to start_date for existing rows
--
-- Vendors may book until the event's END date has passed; admins can
-- close bookings earlier by setting the event status to 'closed'.
-- Safe to run more than once.
-- =============================================================================

do $$
begin
  if exists (select 1 from information_schema.columns
             where table_name = 'events' and column_name = 'event_date') then
    alter table events rename column event_date to start_date;
  end if;
end $$;

alter table events add column if not exists end_date date;
update events set end_date = start_date where end_date is null;
alter table events alter column end_date set not null;

alter table events drop constraint if exists events_date_range_check;
alter table events add constraint events_date_range_check check (end_date >= start_date);

-- -----------------------------------------------------------------------------
-- create_booking — same as in 001, except availability is checked against
-- end_date (an event that has fully ended can't be booked).
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
      or e.end_date < (now() at time zone 'Asia/Kuala_Lumpur')::date;  -- event over

  if v_unavailable is not null then
    raise exception 'STALL_UNAVAILABLE:%', v_unavailable;
  end if;

  v_hold_hours := coalesce((select hold_hours from settings where id = 1), 48);

  insert into bookings (vendor_id, status, expires_at)
  values (p_vendor_id, 'pending_payment', now() + make_interval(hours => v_hold_hours))
  returning id into v_booking;

  insert into booking_items (booking_id, event_id, stall_no, price)
  select v_booking, s.event_id, s.stall_no, s.price
    from event_stalls s
    join _req r on r.event_id = s.event_id and r.stall_no = s.stall_no;

  update bookings
     set total = (select coalesce(sum(price), 0) from booking_items where booking_id = v_booking)
   where id = v_booking;

  update event_stalls s
     set status = 'held',
         vendor_id = p_vendor_id,
         booking_id = v_booking,
         hold_expires_at = (select expires_at from bookings where id = v_booking)
    from _req r
   where r.event_id = s.event_id and r.stall_no = s.stall_no;

  return v_booking;
end $$;

-- Re-apply the lockdown from 003 (create or replace keeps grants, but be explicit).
revoke execute on function create_booking(uuid, jsonb) from public, anon, authenticated;
grant  execute on function create_booking(uuid, jsonb) to service_role;
