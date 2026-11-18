-- =============================================================================
-- 011_swap_stalls.sql — swap (or move) the occupants of two stalls.
--
-- CONCEPT: right before a market opens, admins shuffle vendors to close gaps.
-- A stall's PLACE-bound settings stay put: price and power allocation belong
-- to the physical spot. What moves is the OCCUPANCY: vendor, booking, status
-- (available / held / booked / blocked) and hold deadline. Swapping with an
-- empty stall is simply a move.
--
-- Everything that names the stall moves with the vendor, in one transaction:
--   * event_stalls     occupancy swapped
--   * booking_items    stall numbers updated (the price they paid is kept)
--   * documents        "(Booth 12)" ↔ "(Booth 9)" in live invoice/receipt lines
-- Setup forms are per (event, vendor), so they follow automatically.
-- =============================================================================

create or replace function swap_stalls(p_event_id text, p_a text, p_b text)
returns void
language plpgsql as $$
declare
  ra event_stalls%rowtype;
  rb event_stalls%rowtype;
  tmp constant text := '__swap__';
begin
  if p_a = p_b then raise exception 'SAME_STALL'; end if;

  -- Lock both stalls so a checkout can't grab one mid-swap.
  select * into ra from event_stalls where event_id = p_event_id and stall_no = p_a for update;
  select * into rb from event_stalls where event_id = p_event_id and stall_no = p_b for update;
  if ra.stall_no is null or rb.stall_no is null then raise exception 'STALL_NOT_FOUND'; end if;
  if ra.vendor_id is null and rb.vendor_id is null then raise exception 'BOTH_EMPTY'; end if;

  -- 1) Swap occupancy (price / power_watts stay with the place).
  update event_stalls
     set vendor_id = rb.vendor_id, booking_id = rb.booking_id, status = rb.status, hold_expires_at = rb.hold_expires_at
   where event_id = p_event_id and stall_no = p_a;
  update event_stalls
     set vendor_id = ra.vendor_id, booking_id = ra.booking_id, status = ra.status, hold_expires_at = ra.hold_expires_at
   where event_id = p_event_id and stall_no = p_b;

  -- 2) Booking line items follow their booking: A's booking now points at B
  --    and vice versa. Via a temporary name (A→tmp, B→A, tmp→B) so it also
  --    works when one booking holds both stalls (primary key would clash).
  update booking_items set stall_no = tmp where event_id = p_event_id and stall_no = p_a and booking_id = ra.booking_id;
  update booking_items set stall_no = p_a where event_id = p_event_id and stall_no = p_b and booking_id = rb.booking_id;
  update booking_items set stall_no = p_b where event_id = p_event_id and stall_no = tmp;

  -- 3) Live documents of the vendors involved: swap the booth numbers in the
  --    line descriptions (exact "(Booth X)" match, so 3 never matches 3A).
  update documents
     set lines = replace(replace(replace(lines::text,
                   '(Booth ' || p_a || ')', '(Booth ' || tmp || ')'),
                   '(Booth ' || p_b || ')', '(Booth ' || p_a || ')'),
                   '(Booth ' || tmp || ')', '(Booth ' || p_b || ')')::jsonb
   where event_id = p_event_id
     and voided_at is null
     and vendor_id in (ra.vendor_id, rb.vendor_id);
end $$;

-- Lockdown (as in 003): only the server may call it.
revoke execute on function swap_stalls(text, text, text) from public, anon, authenticated;
grant  execute on function swap_stalls(text, text, text) to service_role;
