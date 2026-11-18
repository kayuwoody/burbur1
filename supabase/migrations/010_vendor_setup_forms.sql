-- =============================================================================
-- 010_vendor_setup_forms.sql — per-event setup details from each vendor:
--   * setup crew (name + IC) for the venue security office's work passes
--   * power requirements beyond standard items (LED lights, chargers)
--
-- CONCEPT: one row per (event, vendor), created the first time an admin or
-- the vendor needs the form link. The vendor fills it in through a secret
-- link (/setup/<access_token>) that works WITHOUT logging in, so it can be
-- sent over WhatsApp, including to vendors an admin added manually.
--
--   workers      [{ "name": "Ali bin Abu", "ic": "900101-14-5678" }, …]  (≥1 to submit)
--   extra_power  null = not answered yet, false = standard items only, true = see list
--   power_items  [{ "device": "Blender", "watts": 900 }, …]  (0 or more)
--
-- IC numbers are personal data: the table is locked like every other (RLS on,
-- no policies) and only readable through the secret link or admin routes.
-- Safe to run more than once.
-- =============================================================================

create table if not exists vendor_event_setup (
  id           uuid primary key default gen_random_uuid(),
  event_id     text not null references events(id) on delete cascade,
  vendor_id    uuid not null references vendors(id) on delete cascade,
  access_token uuid not null unique default gen_random_uuid(),
  workers      jsonb not null default '[]'::jsonb,
  extra_power  boolean,
  power_items  jsonb not null default '[]'::jsonb,
  submitted_at timestamptz,          -- first submission
  updated_at   timestamptz,          -- latest change
  created_at   timestamptz not null default now(),
  unique (event_id, vendor_id)
);

alter table vendor_event_setup enable row level security;
