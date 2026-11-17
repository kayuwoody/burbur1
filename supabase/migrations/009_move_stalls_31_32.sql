-- =============================================================================
-- 009_move_stalls_31_32.sql — stalls 31 and 32 move up, onto the same row
-- as 33 / 33A (just below the escalators), per the updated floor plan.
--
-- CONCEPT: stall positions live once in layout_stalls and every event's map
-- reads them from there, so this one update moves the stalls on all event
-- maps. Bookings, prices and vendors are attached to the stall NUMBER, so
-- nothing else changes.
-- Safe to run more than once.
-- =============================================================================

update layout_stalls set x = 657, y = 762, w = 57, h = 31 where layout_id = 'main' and stall_no = '31';
update layout_stalls set x = 719, y = 762, w = 59, h = 31 where layout_id = 'main' and stall_no = '32';
