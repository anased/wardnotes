--
-- Make notes.category optional (2026-11-14)
--
-- The specialty of a note is now derived from its primary topic (the
-- top-level topic above it), so the web app stops writing notes.category.
--   * notes.category: DROP NOT NULL.
--   * normalize_note_taxonomy(): a missing or blank category is stored as
--     NULL instead of '' (normalize_tag_name() turns NULL into '').
--     Non-blank categories are normalized exactly as before.
--
-- * Compatible with app builds that still write a category: those values are
--   kept and normalized as before.
-- * The column itself is kept for now; it is dropped in a later migration
--   once no app version reads or writes it.
-- * Safe to run more than once. Undo with
--   make_note_category_optional_rollback.sql.
--

BEGIN;

ALTER TABLE public.notes ALTER COLUMN category DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.normalize_note_taxonomy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
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

COMMIT;
