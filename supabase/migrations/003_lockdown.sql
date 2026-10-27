-- =============================================================================
-- 003_lockdown.sql — block direct database access with the publishable key.
--
-- CONCEPT: the publishable (anon) key is embedded in the browser for login,
-- so anyone can read it. Supabase exposes every public table and function
-- over its REST API to that key unless we lock them down. Our app never
-- needs that access: all data flows through our own API routes using the
-- SECRET key, which bypasses RLS and these grants entirely.
--
-- So we:
--   1. Enable RLS on every table with NO policies → publishable/anon and
--      logged-in users get zero rows and can't write.
--   2. Revoke EXECUTE on our functions from public/anon/authenticated, so
--      nobody can call create_booking or admin_booking_action directly via
--      /rest/v1/rpc (e.g. to confirm their own booking without paying).
--
-- Safe to run more than once.
-- =============================================================================

-- 1) RLS on, no policies = deny all for anon/authenticated.
alter table vendors          enable row level security;
alter table admins           enable row level security;
alter table settings         enable row level security;
alter table layouts          enable row level security;
alter table layout_stalls    enable row level security;
alter table events           enable row level security;
alter table event_stalls     enable row level security;
alter table bookings         enable row level security;
alter table booking_items    enable row level security;
alter table notification_log enable row level security;

-- 2) Functions: only the server (service_role / secret key) may call them.
revoke execute on function expire_stale_holds()                     from public, anon, authenticated;
revoke execute on function create_booking(uuid, jsonb)              from public, anon, authenticated;
revoke execute on function admin_booking_action(uuid, text, text)   from public, anon, authenticated;
grant  execute on function expire_stale_holds()                     to service_role;
grant  execute on function create_booking(uuid, jsonb)              to service_role;
grant  execute on function admin_booking_action(uuid, text, text)   to service_role;
