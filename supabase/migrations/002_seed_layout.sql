-- 002_seed_layout.sql — master floor plan traced from the original layout image.
-- 34 stalls. Coordinates are pixels in an 830 x 1050 canvas (same as the image).
-- To add/move stalls later, edit layout_stalls rows; new events pick them up.

insert into layouts (id, name, width, height, blocks) values
  ('main', 'Main floor', 830, 1050, '[{"label":"Chicken Plus","x":96,"y":38,"w":173,"h":769},{"label":"Ayu Borneo","x":499,"y":38,"w":193,"h":596},{"label":"Escalators","x":499,"y":682,"w":249,"h":32},{"label":"Escalators","x":499,"y":720,"w":249,"h":31},{"label":"Shang","x":43,"y":907,"w":245,"h":125},{"label":"Powerplant","x":499,"y":907,"w":303,"h":125}]'::jsonb)
on conflict (id) do update set name = excluded.name, width = excluded.width, height = excluded.height, blocks = excluded.blocks;

insert into layout_stalls (layout_id, stall_no, x, y, w, h, sort_order) values
  ('main', '1', 288, 38, 38, 58, 0),
  ('main', '2', 288, 106, 38, 57, 1),
  ('main', '3', 288, 173, 38, 57, 2),
  ('main', '3A', 288, 240, 38, 57, 3),
  ('main', '5', 288, 308, 38, 57, 4),
  ('main', '6', 288, 374, 38, 58, 5),
  ('main', '7', 288, 442, 38, 57, 6),
  ('main', '8', 288, 509, 38, 57, 7),
  ('main', '9', 288, 576, 38, 57, 8),
  ('main', '10', 432, 38, 38, 58, 9),
  ('main', '11', 432, 106, 38, 57, 10),
  ('main', '12', 432, 173, 38, 57, 11),
  ('main', '13', 432, 240, 38, 57, 12),
  ('main', '13A', 432, 308, 38, 57, 13),
  ('main', '15', 432, 374, 38, 58, 14),
  ('main', '16', 432, 442, 38, 57, 15),
  ('main', '17', 432, 509, 38, 57, 16),
  ('main', '18', 432, 576, 38, 57, 17),
  ('main', '19', 288, 682, 38, 59, 18),
  ('main', '20', 288, 748, 38, 58, 19),
  ('main', '21', 230, 816, 58, 30, 20),
  ('main', '22', 164, 816, 57, 30, 21),
  ('main', '23', 96, 816, 57, 30, 22),
  ('main', '23A', 28, 816, 59, 30, 23),
  ('main', '25', 298, 908, 38, 57, 24),
  ('main', '26', 298, 974, 38, 59, 25),
  ('main', '27', 452, 975, 37, 58, 26),
  ('main', '28', 452, 908, 37, 57, 27),
  ('main', '29', 518, 854, 58, 31, 28),
  ('main', '30', 586, 854, 57, 31, 29),
  ('main', '31', 682, 854, 57, 31, 30),
  ('main', '32', 744, 854, 59, 31, 31),
  ('main', '33', 518, 762, 58, 30, 32),
  ('main', '33A', 586, 762, 57, 30, 33)
on conflict (layout_id, stall_no) do update set x = excluded.x, y = excluded.y, w = excluded.w, h = excluded.h, sort_order = excluded.sort_order;
