--
-- Normalize tags and categories on write (2026-11-11)
--
-- Keeps the taxonomy clean no matter which app writes it (web, the current
-- mobile build, the SQL editor):
--   * tags.name and categories.name are trimmed with internal whitespace
--     collapsed.
--   * notes.tags / flashcards.tags: each tag is trimmed, written with the
--     spelling already in the user's tags table when one matches ignoring case
--     ("stroke" -> "Stroke"), and case-insensitive duplicates are removed.
--   * notes.category uses the spelling already in the user's categories table
--     when one matches ignoring case.
--   * A tag used on a note that has no row in the tags table gets one, so it
--     shows up in tag management and filters.
--   * Category names are unique per user regardless of case.
--   * get_tag_usage() returns the caller's tags with note counts, for the
--     Library tag filter.
--
-- Requires improve_tag_management.sql (normalize_tag_name, dedupe_tags_ci).
-- Safe to run more than once. Ends with ROLLBACK by default (dry run);
-- change to COMMIT to apply.
--

BEGIN;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Canonical form of a tag list for one user: trimmed, existing spelling,
-- no blanks, no case-insensitive duplicates, original order.
CREATE OR REPLACE FUNCTION public.canonical_tags(p_user_id uuid, p_tags text[])
RETURNS text[]
LANGUAGE sql STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT public.dedupe_tags_ci(array(
    SELECT COALESCE(
             (SELECT tg.name FROM public.tags tg
              WHERE tg.user_id = p_user_id
                AND lower(tg.name) = lower(public.normalize_tag_name(u.t))
              LIMIT 1),
             public.normalize_tag_name(u.t))
    FROM unnest(COALESCE(p_tags, '{}'::text[])) WITH ORDINALITY AS u(t, ord)
    WHERE public.normalize_tag_name(u.t) <> ''
    ORDER BY u.ord
  ));
$$;

-- ---------------------------------------------------------------------------
-- tags / categories: normalize the name column
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.normalize_name_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.name := public.normalize_tag_name(NEW.name);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tags_normalize_name ON public.tags;
CREATE TRIGGER tags_normalize_name
  BEFORE INSERT OR UPDATE OF name ON public.tags
  FOR EACH ROW EXECUTE FUNCTION public.normalize_name_column();

DROP TRIGGER IF EXISTS categories_normalize_name ON public.categories;
CREATE TRIGGER categories_normalize_name
  BEFORE INSERT OR UPDATE OF name ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.normalize_name_column();

CREATE UNIQUE INDEX IF NOT EXISTS categories_user_id_lower_name_key
  ON public.categories (user_id, lower(name));

-- ---------------------------------------------------------------------------
-- notes: canonical tags and category, and register new tags
-- ---------------------------------------------------------------------------

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

DROP TRIGGER IF EXISTS notes_normalize_taxonomy ON public.notes;
CREATE TRIGGER notes_normalize_taxonomy
  BEFORE INSERT OR UPDATE OF tags, category ON public.notes
  FOR EACH ROW EXECUTE FUNCTION public.normalize_note_taxonomy();

-- ---------------------------------------------------------------------------
-- flashcards: canonical tags (they copy the note's tags)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.normalize_flashcard_tags()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.tags := public.canonical_tags(NEW.user_id, NEW.tags);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS flashcards_normalize_tags ON public.flashcards;
CREATE TRIGGER flashcards_normalize_tags
  BEFORE INSERT OR UPDATE OF tags ON public.flashcards
  FOR EACH ROW EXECUTE FUNCTION public.normalize_flashcard_tags();

-- ---------------------------------------------------------------------------
-- get_tag_usage: the caller's tags with how many notes use each
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_tag_usage()
RETURNS TABLE (id uuid, name text, note_count bigint)
LANGUAGE sql STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT tg.id, tg.name,
         (SELECT count(*) FROM public.notes n
          WHERE n.user_id = tg.user_id AND n.tags @> ARRAY[tg.name]) AS note_count
  FROM public.tags tg
  WHERE tg.user_id = auth.uid()
  ORDER BY lower(tg.name);
$$;

REVOKE ALL ON FUNCTION public.get_tag_usage() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_tag_usage() TO authenticated;

-- ---------------------------------------------------------------------------
-- Dry-run report: what the triggers would change in existing rows if they
-- were rewritten today (existing rows are NOT rewritten by this migration).
-- ---------------------------------------------------------------------------

SELECT
  (SELECT count(*) FROM public.notes n
   WHERE n.tags IS DISTINCT FROM public.canonical_tags(n.user_id, n.tags)) AS notes_with_noncanonical_tags,
  (SELECT count(*) FROM public.flashcards f
   WHERE f.tags IS DISTINCT FROM public.canonical_tags(f.user_id, f.tags)) AS flashcards_with_noncanonical_tags,
  (SELECT count(*) FROM pg_trigger
   WHERE tgname IN ('tags_normalize_name', 'categories_normalize_name',
                    'notes_normalize_taxonomy', 'flashcards_normalize_tags')) AS triggers_installed,
  (SELECT count(*) FROM pg_indexes
   WHERE indexname = 'categories_user_id_lower_name_key') AS category_index_installed;

ROLLBACK;  -- dry run. Change to COMMIT to apply.
