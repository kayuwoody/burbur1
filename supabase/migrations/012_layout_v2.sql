-- =============================================================================
-- 012_layout_v2.sql — second floor plan ('main2'): 39 booths.
--
-- What's new compared with 'main':
--   - New booths 36, 37, 38, 39 on the row just below the escalators
--     (where 33 / 33A / 31 / 32 sat after 009).
--   - 29, 30, 31, 32 on the row above Powerplant; 33, 33A and new 35 on the
--     same row further right.
--   - Entrance drawn as a grey block; canvas is wider (1011 px) to fit 35.
--
-- CONCEPT: this is a NEW layout rather than an edit of 'main', so events that
-- already exist keep the map their vendors booked on. New events pick a
-- layout in Admin → Events (the form now defaults to this one).
-- Coordinates were traced from the updated plan image and scaled to the same
-- booth size as 'main'. Safe to run more than once.
--
-- To move an EXISTING event onto this layout (e.g. 261212), run the commented
-- block at the bottom: it switches the map and adds the booths that event
-- doesn't have yet, priced like the event's most common booth price.
-- Booked booths keep their number (and vendor); only their position changes.
-- =============================================================================

insert into layouts (id, name, width, height, blocks) values
  ('main2', 'Main floor v2 (booths 35–39)', 1011, 1182, '[{"label":"Chicken Plus","x":79,"y":20,"w":173,"h":789},{"label":"Ayu Borneo","x":481,"y":20,"w":192,"h":593},{"label":"Escalators","x":481,"y":671,"w":314,"h":34},{"label":"Escalators","x":481,"y":712,"w":314,"h":35},{"label":"Shang","x":27,"y":920,"w":242,"h":138},{"label":"Powerplant","x":481,"y":920,"w":520,"h":138},{"label":"Entrance","x":275,"y":1080,"w":201,"h":92}]'::jsonb)
on conflict (id) do update set name = excluded.name, width = excluded.width, height = excluded.height, blocks = excluded.blocks;

insert into layout_stalls (layout_id, stall_no, x, y, w, h, sort_order) values
  ('main2', '1', 271, 20, 37, 57, 0),
  ('main2', '2', 271, 87, 37, 57, 1),
  ('main2', '3', 271, 154, 37, 58, 2),
  ('main2', '3A', 271, 221, 37, 56, 3),
  ('main2', '5', 271, 289, 37, 56, 4),
  ('main2', '6', 271, 354, 37, 57, 5),
  ('main2', '7', 271, 422, 37, 57, 6),
  ('main2', '8', 271, 488, 37, 58, 7),
  ('main2', '9', 271, 555, 37, 56, 8),
  ('main2', '10', 413, 20, 38, 57, 9),
  ('main2', '11', 413, 87, 38, 57, 10),
  ('main2', '12', 413, 154, 38, 58, 11),
  ('main2', '13', 413, 221, 38, 56, 12),
  ('main2', '13A', 413, 289, 38, 56, 13),
  ('main2', '15', 413, 354, 38, 57, 14),
  ('main2', '16', 413, 422, 38, 57, 15),
  ('main2', '17', 413, 488, 38, 58, 16),
  ('main2', '18', 413, 555, 38, 56, 17),
  ('main2', '19', 270, 671, 39, 63, 18),
  ('main2', '20', 273, 744, 36, 66, 19),
  ('main2', '21', 213, 819, 60, 33, 20),
  ('main2', '22', 148, 819, 56, 33, 21),
  ('main2', '23', 79, 819, 57, 33, 22),
  ('main2', '23A', 12, 819, 58, 33, 23),
  ('main2', '25', 281, 920, 37, 63, 24),
  ('main2', '26', 281, 994, 37, 65, 25),
  ('main2', '27', 434, 994, 37, 65, 26),
  ('main2', '28', 434, 920, 37, 63, 27),
  ('main2', '29', 500, 862, 59, 35, 28),
  ('main2', '30', 568, 862, 56, 35, 29),
  ('main2', '31', 663, 862, 58, 35, 30),
  ('main2', '32', 727, 863, 57, 33, 31),
  ('main2', '33', 818, 861, 56, 34, 32),
  ('main2', '33A', 879, 861, 59, 34, 33),
  ('main2', '35', 943, 861, 57, 34, 34),
  ('main2', '36', 500, 760, 59, 32, 35),
  ('main2', '37', 568, 760, 56, 32, 36),
  ('main2', '38', 673, 759, 57, 32, 37),
  ('main2', '39', 735, 759, 58, 32, 38)
on conflict (layout_id, stall_no) do update set x = excluded.x, y = excluded.y, w = excluded.w, h = excluded.h, sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------------
-- Optional: move an existing event onto 'main2' (replace 261212 twice).
-- ---------------------------------------------------------------------------
-- update events set layout_id = 'main2' where id = '261212';
-- insert into event_stalls (event_id, stall_no, price, power_watts, status)
-- select '261212', ls.stall_no,
--        (select mode() within group (order by price) from event_stalls where event_id = '261212'),
--        (select mode() within group (order by power_watts) from event_stalls where event_id = '261212'),
--        'available'
-- from layout_stalls ls
-- where ls.layout_id = 'main2'
-- on conflict (event_id, stall_no) do nothing;
