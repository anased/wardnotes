-- Tag inventory for the tag -> topic migration. READ-ONLY (only SELECTs).
--
-- Run in the Supabase SQL editor (or via the Supabase MCP). It returns one
-- row with one JSON cell: copy that cell into a file, e.g. inventory.json,
-- then run:
--   node scripts/tag-migration/tag-migration.mjs export inventory.json
--
-- Each entry: user_id, tag, note_count, categories ({category: notes}),
-- in_tags_table (tag has a row in public.tags), sample_titles (up to 3).

WITH note_tags AS (
  SELECT n.user_id, t AS tag, n.category, n.title, n.created_at
  FROM public.notes n, unnest(n.tags) AS t
),
per_tag AS (
  SELECT user_id, tag, count(*) AS note_count
  FROM note_tags
  GROUP BY user_id, tag
),
per_category AS (
  SELECT user_id, tag, jsonb_object_agg(category, n) AS categories
  FROM (SELECT user_id, tag, category, count(*) AS n FROM note_tags GROUP BY user_id, tag, category) c
  GROUP BY user_id, tag
),
samples AS (
  SELECT user_id, tag, jsonb_agg(title ORDER BY created_at DESC) FILTER (WHERE rn <= 3) AS sample_titles
  FROM (
    SELECT user_id, tag, title, created_at,
           row_number() OVER (PARTITION BY user_id, tag ORDER BY created_at DESC) AS rn
    FROM note_tags
  ) s
  GROUP BY user_id, tag
),
inventory AS (
  -- Tags on notes, plus tags in the tags table that no note uses
  SELECT COALESCE(p.user_id, tg.user_id) AS user_id,
         COALESCE(p.tag, tg.name) AS tag,
         COALESCE(p.note_count, 0) AS note_count,
         COALESCE(c.categories, '{}'::jsonb) AS categories,
         (tg.id IS NOT NULL) AS in_tags_table,
         COALESCE(s.sample_titles, '[]'::jsonb) AS sample_titles
  FROM per_tag p
  FULL JOIN public.tags tg ON tg.user_id = p.user_id AND tg.name = p.tag
  LEFT JOIN per_category c ON c.user_id = COALESCE(p.user_id, tg.user_id) AND c.tag = COALESCE(p.tag, tg.name)
  LEFT JOIN samples s ON s.user_id = COALESCE(p.user_id, tg.user_id) AND s.tag = COALESCE(p.tag, tg.name)
)
SELECT jsonb_agg(to_jsonb(i) ORDER BY i.user_id, i.note_count DESC, lower(i.tag)) AS inventory
FROM inventory i;
