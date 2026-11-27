-- =============================================================================
-- 013_notification_flags.sql — let admins flag a WhatsApp send that didn't
-- land (message not received, vendor not on WhatsApp, wrong number…).
--
-- CONCEPT: every send is already one notification_log row per (event,
-- vendor). A row now also has a status:
--   'sent'   → counts as "this vendor has been told about this event"
--   'failed' → flagged by an admin; the vendor counts as NOT told again, so
--              they reappear under "Not yet sent", with the reason shown.
-- Flags can be undone (back to 'sent'). Nothing is deleted, so the history
-- of what was sent when stays intact.
--
-- The table already has RLS on with no policies (003_lockdown.sql), so these
-- new columns are only reachable through the server's secret key.
-- Safe to run more than once.
-- =============================================================================

alter table notification_log
  add column if not exists status text not null default 'sent',
  -- 'not_received' | 'no_whatsapp' | 'wrong_number' | 'other'
  add column if not exists flag_reason text,
  add column if not exists flag_note text,
  add column if not exists flagged_at timestamptz;

-- Status values allowed (added separately so re-running doesn't fail).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'notification_log_status_check') then
    alter table notification_log
      add constraint notification_log_status_check check (status in ('sent', 'failed'));
  end if;
end $$;

-- Speeds up "latest flag per vendor" lookups on the Notify page.
create index if not exists notification_log_vendor_idx on notification_log (vendor_id, created_at desc);
