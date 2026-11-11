-- Read-only taxonomy audit for WardNotes.
-- Lists every distinct tag and category per user with usage counts, and
-- whether each tag has a row in the tags table. Only SELECTs; safe to run on
-- production (paste into the Supabase SQL editor).
--
-- Feed the JSON output to scripts/audit-taxonomy.mjs to group likely
-- duplicates (case, singular/plural, typos, "X new"-style leftovers).

WITH note_tags AS (
  SELECT n.user_id, t AS name, count(*) AS note_count
  FROM public.notes n, unnest(n.tags) AS t
  GROUP BY n.user_id, t
),
tag_inventory AS (
  SELECT COALESCE(nt.user_id, tg.user_id) AS user_id,
         'tag'::text AS kind,
         COALESCE(nt.name, tg.name) AS name,
         COALESCE(nt.note_count, 0) AS note_count,
         (tg.id IS NOT NULL) AS in_table
  FROM note_tags nt
  FULL JOIN public.tags tg
    ON tg.user_id = nt.user_id AND tg.name = nt.name
),
category_inventory AS (
  SELECT COALESCE(nc.user_id, c.user_id) AS user_id,
         'category'::text AS kind,
         COALESCE(nc.name, c.name) AS name,
         COALESCE(nc.note_count, 0) AS note_count,
         (c.id IS NOT NULL) AS in_table
  FROM (
    SELECT user_id, category AS name, count(*) AS note_count
    FROM public.notes
    GROUP BY user_id, category
  ) nc
  FULL JOIN public.categories c
    ON c.user_id = nc.user_id AND c.name = nc.name
)
SELECT user_id, kind, name, note_count, in_table
FROM (SELECT * FROM tag_inventory UNION ALL SELECT * FROM category_inventory) x
ORDER BY user_id, kind, lower(name), name;
