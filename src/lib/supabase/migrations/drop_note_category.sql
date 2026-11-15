--
-- Drop notes.category (2026-11-15)
--
-- The specialty of a note is the top-level topic above its primary topic;
-- every note is filed under a topic (scripts/tag-migration), and the app no
-- longer reads or writes notes.category.
--
--   * Snapshot (id, user_id, category) into backup.notes_category_pre_drop
--     first, so the values can be restored.
--   * normalize_note_taxonomy(): same as before minus the category step (it
--     would fail once the column is gone).
--   * The trigger fired on UPDATE OF tags, category; it is recreated on
--     UPDATE OF tags (Postgres won't drop a column a trigger is declared on).
--   * Drop the column.
--
-- The categories table is left as it is.
-- Safe to run more than once. Undo with drop_note_category_rollback.sql.
--

BEGIN;

CREATE SCHEMA IF NOT EXISTS backup;
REVOKE ALL ON SCHEMA backup FROM public, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'notes' AND column_name = 'category')
     AND to_regclass('backup.notes_category_pre_drop') IS NULL THEN
    CREATE TABLE backup.notes_category_pre_drop AS
      SELECT id, user_id, category FROM public.notes;
  END IF;
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA backup FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.normalize_note_taxonomy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.tags := public.canonical_tags(NEW.user_id, NEW.tags);

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
  BEFORE INSERT OR UPDATE OF tags ON public.notes
  FOR EACH ROW EXECUTE FUNCTION public.normalize_note_taxonomy();

ALTER TABLE public.notes DROP COLUMN IF EXISTS category;

COMMIT;
