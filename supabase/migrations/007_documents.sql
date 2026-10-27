-- =============================================================================
-- 007_documents.sql — invoices & receipts.
--
-- CONCEPT:
--   * An INVOICE is issued per (event, vendor, booking). A booking covering
--     two events gets two invoices, because numbering is per event.
--     Stalls an admin assigned manually (no online booking) get an invoice
--     per (event, vendor) with booking_id = null.
--   * A RECEIPT is issued against one invoice once payment is confirmed.
--     Its number is the invoice number + 'R' (e.g. GVO2609267-01206R),
--     matching the company's existing paperwork.
--   * Documents are SNAPSHOTS: bill-to, line items and total are copied in
--     at issue time, so editing a vendor or price later never changes a
--     document that was already sent.
--   * Each document has an unguessable access_token. The PDF link
--     /api/documents/<token> works without logging in, so it can be pasted
--     into WhatsApp.
--
-- Invoice numbers: <event doc_prefix>-<5-digit running number per event>,
-- e.g. GVO2609267-00001. The prefix and next number are editable per event,
-- so numbering can continue from existing paper invoices.
--
-- Safe to run more than once.
-- =============================================================================

-- ---- Company details printed on documents (single settings row) ----
alter table settings add column if not exists company_name    text;
alter table settings add column if not exists company_address text;
alter table settings add column if not exists footer_brand    text;   -- e.g. 'MANIACS MANSION'
alter table settings add column if not exists contact_name    text;
alter table settings add column if not exists contact_phone   text;
alter table settings add column if not exists contact_email   text;

-- Pre-fill from the sample invoice (only where still empty).
update settings set
  company_name      = coalesce(company_name, 'MANIACS MANSION TRADING'),
  company_address   = coalesce(company_address, 'LOT 29167, Jalan Segar Perdana, Taman Segar Perdana, 43200 Cheras, Selangor'),
  footer_brand      = coalesce(footer_brand, 'MANIACS MANSION'),
  contact_name      = coalesce(contact_name, 'Madison Foo'),
  contact_phone     = coalesce(contact_phone, '012-6860349'),
  contact_email     = coalesce(contact_email, 'maniacsmansion14@gmail.com'),
  bank_name         = coalesce(bank_name, 'Maybank'),
  bank_account_no   = coalesce(bank_account_no, '514785058338'),
  bank_account_name = coalesce(bank_account_name, 'MANIACS MANSION TRADING')
where id = 1;

-- ---- Per-event fields used on documents ----
alter table events add column if not exists venue       text;               -- 'EkoCheras Mall'
alter table events add column if not exists doc_prefix  text;               -- 'GVO2609267'
alter table events add column if not exists doc_next_no int not null default 1;

-- ---- Documents ----
create table if not exists documents (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null check (kind in ('invoice', 'receipt')),
  number          text not null unique,
  event_id        text not null references events(id),
  vendor_id       uuid not null references vendors(id),
  booking_id      uuid references bookings(id),
  invoice_id      uuid references documents(id),          -- receipts only
  issued_on       date not null,
  bill_to_name    text not null,
  bill_to_address text,
  lines           jsonb not null default '[]'::jsonb,     -- [{description, price, total}]
  total           numeric(10, 2) not null default 0,
  access_token    uuid not null unique default gen_random_uuid(),
  voided_at       timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists documents_event_idx   on documents (event_id, vendor_id);
create index if not exists documents_booking_idx on documents (booking_id);
create index if not exists documents_invoice_idx on documents (invoice_id);

-- -----------------------------------------------------------------------------
-- issue_document(...) — create an invoice or receipt with the next number.
--
-- CONCEPT: numbering must never hand the same number to two documents, even
-- if two admins click at once. The event row is locked (FOR UPDATE) while
-- the next number is taken and the counter bumped, so concurrent calls
-- queue up. The function is also IDEMPOTENT: if a live (non-void) invoice
-- already exists for this event+vendor+booking (or a receipt for this
-- invoice), that one is returned instead of creating a duplicate.
-- -----------------------------------------------------------------------------
create or replace function issue_document(
  p_kind            text,
  p_event_id        text,
  p_vendor_id       uuid,
  p_booking_id      uuid,
  p_invoice_id      uuid,
  p_issued_on       date,
  p_bill_to_name    text,
  p_bill_to_address text,
  p_lines           jsonb,
  p_total           numeric
) returns uuid
language plpgsql as $$
declare
  v_prefix   text;
  v_next     int;
  v_number   text;
  v_existing uuid;
  v_id       uuid;
begin
  if p_kind = 'invoice' then
    -- Serialise numbering for this event.
    select doc_prefix, doc_next_no into v_prefix, v_next from events where id = p_event_id for update;
    if not found then raise exception 'EVENT_NOT_FOUND'; end if;
    if coalesce(v_prefix, '') = '' then raise exception 'NO_PREFIX'; end if;

    select id into v_existing from documents
     where kind = 'invoice' and voided_at is null and event_id = p_event_id and vendor_id = p_vendor_id
       and booking_id is not distinct from p_booking_id
     limit 1;
    if v_existing is not null then return v_existing; end if;

    -- Skip numbers already used (e.g. typed in by hand on another document).
    loop
      v_number := v_prefix || '-' || lpad(v_next::text, 5, '0');
      v_next := v_next + 1;
      exit when not exists (select 1 from documents where number = v_number);
    end loop;
    update events set doc_next_no = v_next where id = p_event_id;

  elsif p_kind = 'receipt' then
    -- Lock the invoice so two "create receipt" clicks can't both insert.
    select number into v_number from documents
     where id = p_invoice_id and kind = 'invoice' and voided_at is null for update;
    if not found then raise exception 'INVOICE_NOT_FOUND'; end if;

    select id into v_existing from documents where kind = 'receipt' and invoice_id = p_invoice_id and voided_at is null limit 1;
    if v_existing is not null then return v_existing; end if;

    v_number := v_number || 'R';
    -- A voided earlier receipt may hold that number: add a suffix.
    while exists (select 1 from documents where number = v_number) loop
      v_number := v_number || '-' || substr(md5(random()::text), 1, 3);
    end loop;
  else
    raise exception 'UNKNOWN_KIND:%', p_kind;
  end if;

  insert into documents (kind, number, event_id, vendor_id, booking_id, invoice_id, issued_on,
                         bill_to_name, bill_to_address, lines, total)
  values (p_kind, v_number, p_event_id, p_vendor_id, p_booking_id, p_invoice_id, p_issued_on,
          p_bill_to_name, p_bill_to_address, coalesce(p_lines, '[]'::jsonb), coalesce(p_total, 0))
  returning id into v_id;
  return v_id;
end $$;

-- -----------------------------------------------------------------------------
-- Keep documents in step with bookings: when a booking is cancelled or its
-- unpaid hold expires, its invoice/receipt is VOIDED (kept for the record,
-- shown as void, never reused). Same functions as 001, plus one statement.
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
  ), released as (
    update event_stalls
       set status = 'available', vendor_id = null, booking_id = null, hold_expires_at = null
     where status = 'held'
       and booking_id in (select id from expired)
    returning 1
  )
  update documents
     set voided_at = now()
   where voided_at is null
     and booking_id in (select id from expired);
end $$;

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
    update documents set voided_at = now() where booking_id = p_booking_id and voided_at is null;

  else
    raise exception 'UNKNOWN_ACTION:%', p_action;
  end if;
end $$;

-- ---- Lockdown (same rules as 003) ----
alter table documents enable row level security;
revoke execute on function issue_document(text, text, uuid, uuid, uuid, date, text, text, jsonb, numeric) from public, anon, authenticated;
grant  execute on function issue_document(text, text, uuid, uuid, uuid, date, text, text, jsonb, numeric) to service_role;
revoke execute on function expire_stale_holds() from public, anon, authenticated;
revoke execute on function admin_booking_action(uuid, text, text) from public, anon, authenticated;
grant  execute on function expire_stale_holds() to service_role;
grant  execute on function admin_booking_action(uuid, text, text) to service_role;
