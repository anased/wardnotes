--
-- Undo drop_note_category.sql: re-adds notes.category (nullable), restores
-- the values from backup.notes_category_pre_drop, and restores the category
-- step of normalize_note_taxonomy() (as in make_note_category_optional.sql)
-- and its trigger on UPDATE OF tags, category.
-- Notes created after the drop get NULL.
--

BEGIN;

-- The restored trigger function looks categories up
DO $$
BEGIN
  IF to_regclass('public.categories') IS NULL THEN
    RAISE EXCEPTION 'public.categories is missing: run drop_categories_rollback.sql first';
  END IF;
END $$;

ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS category text;

UPDATE public.notes n
SET category = b.category
FROM backup.notes_category_pre_drop b
WHERE b.id = n.id AND n.category IS DISTINCT FROM b.category;

CREATE OR REPLACE FUNCTION public.normalize_note_taxonomy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.tags := public.canonical_tags(NEW.user_id, NEW.tags);

  NEW.category := NULLIF(COALESCE(
    (SELECT c.name FROM public.categories c
     WHERE c.user_id = NEW.user_id
       AND lower(c.name) = lower(public.normalize_tag_name(NEW.category))
     LIMIT 1),
    public.normalize_tag_name(NEW.category)), '');

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

DROP TRIGGER IF EXISTS notes_normalize_taxonomy ON public.notes;
CREATE TRIGGER notes_normalize_taxonomy
  BEFORE INSERT OR UPDATE OF tags, category ON public.notes
  FOR EACH ROW EXECUTE FUNCTION public.normalize_note_taxonomy();

COMMIT;
