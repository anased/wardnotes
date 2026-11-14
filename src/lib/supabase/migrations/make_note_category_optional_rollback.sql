--
-- Rollback for make_note_category_optional.sql
--
-- Restores NOT NULL on notes.category. Notes without a category first get
-- one: the name of the top-level (root) topic above their primary topic
-- (the first one alphabetically when there are several), else 'General'.
-- Also restores the previous normalize_note_taxonomy() (blank -> '').
--
-- Ends with ROLLBACK by default (dry run; the final SELECT reports what would
-- change). Change ROLLBACK to COMMIT to apply.
--

BEGIN;

-- Report before backfilling
SELECT count(*) AS notes_without_category
FROM public.notes
WHERE category IS NULL OR btrim(category) = '';

WITH RECURSIVE up AS (
  -- start at each note's primary topic
  SELECT nt.note_id, nt.topic_id, 0 AS depth
  FROM public.note_topics nt
  JOIN public.notes n ON n.id = nt.note_id
  WHERE nt.is_primary AND (n.category IS NULL OR btrim(n.category) = '')
  UNION
  SELECT up.note_id, e.parent_id, up.depth + 1
  FROM up
  JOIN public.topic_edges e ON e.child_id = up.topic_id
  WHERE up.depth < 50
),
roots AS (
  SELECT DISTINCT ON (up.note_id) up.note_id, t.name
  FROM up
  JOIN public.topics t ON t.id = up.topic_id
  WHERE NOT EXISTS (SELECT 1 FROM public.topic_edges e WHERE e.child_id = up.topic_id)
  ORDER BY up.note_id, lower(t.name)
)
UPDATE public.notes n
SET category = COALESCE((SELECT r.name FROM roots r WHERE r.note_id = n.id), 'General')
WHERE n.category IS NULL OR btrim(n.category) = '';

CREATE OR REPLACE FUNCTION public.normalize_note_taxonomy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.tags := public.canonical_tags(NEW.user_id, NEW.tags);

  NEW.category := COALESCE(
    (SELECT c.name FROM public.categories c
     WHERE c.user_id = NEW.user_id
       AND lower(c.name) = lower(public.normalize_tag_name(NEW.category))
     LIMIT 1),
    public.normalize_tag_name(NEW.category));

  -- Give every tag on the note a row in the tags table.
  INSERT INTO public.tags (user_id, name)
  SELECT NEW.user_id, t
  FROM unnest(NEW.tags) AS t
  WHERE char_length(t) BETWEEN 1 AND 50
    AND NOT EXISTS (
      SELECT 1 FROM public.tags tg
      WHERE tg.user_id = NEW.user_id AND lower(tg.name) = lower(t)
    )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

ALTER TABLE public.notes ALTER COLUMN category SET NOT NULL;

-- Report: category distribution after the backfill
SELECT category, count(*) AS notes
FROM public.notes
GROUP BY category
ORDER BY count(*) DESC;

ROLLBACK;  -- change to COMMIT to apply
