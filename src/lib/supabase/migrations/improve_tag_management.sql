--
-- Tag Management Migration
--
-- Tag names live in three places: the tags table, notes.tags and flashcards.tags.
-- This migration keeps them in sync:
--   * rename_tag() renames a tag everywhere in one transaction
--   * delete_tag() removes a tag from every note and flashcard, then deletes it
--   * tag names are unique per user regardless of case ("CHF" and "chf" are one tag)
--   * existing data is cleaned up so the rules above hold
--
-- Safe to run more than once.
--

-- ----------------------------------------------------------------------------
-- Helpers
-- ----------------------------------------------------------------------------

-- Trim and collapse internal whitespace.
CREATE OR REPLACE FUNCTION public.normalize_tag_name(p_name text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT btrim(regexp_replace(COALESCE(p_name, ''), '\s+', ' ', 'g'));
$$;

-- Remove case-insensitive duplicates from a tag array, keeping the first
-- spelling and the original order.
CREATE OR REPLACE FUNCTION public.dedupe_tags_ci(p_tags text[])
RETURNS text[]
LANGUAGE sql IMMUTABLE
AS $$
  SELECT COALESCE(array_agg(t ORDER BY ord), '{}'::text[])
  FROM (
    SELECT DISTINCT ON (lower(t)) t, ord
    FROM unnest(p_tags) WITH ORDINALITY AS u(t, ord)
    WHERE btrim(t) <> ''
    ORDER BY lower(t), ord
  ) s;
$$;

-- ----------------------------------------------------------------------------
-- Clean up existing data
-- ----------------------------------------------------------------------------

-- Drop tags that differ only by case or spacing, keeping the oldest one.
DELETE FROM public.tags t
USING public.tags keep
WHERE t.user_id = keep.user_id
  AND lower(public.normalize_tag_name(t.name)) = lower(public.normalize_tag_name(keep.name))
  AND (COALESCE(keep.created_at, '-infinity'), keep.id) < (COALESCE(t.created_at, '-infinity'), t.id);

-- Normalize whitespace in tag names.
UPDATE public.tags
SET name = public.normalize_tag_name(name)
WHERE name <> public.normalize_tag_name(name);

-- Add tags that appear on notes but are missing from the tags table
-- (for example, left behind by an earlier rename), so they can be managed.
INSERT INTO public.tags (user_id, name)
SELECT DISTINCT ON (n.user_id, lower(public.normalize_tag_name(t)))
  n.user_id, public.normalize_tag_name(t)
FROM public.notes n, unnest(n.tags) AS t
WHERE char_length(public.normalize_tag_name(t)) BETWEEN 1 AND 50
  AND NOT EXISTS (
    SELECT 1 FROM public.tags existing
    WHERE existing.user_id = n.user_id
      AND lower(existing.name) = lower(public.normalize_tag_name(t))
  )
ORDER BY n.user_id, lower(public.normalize_tag_name(t)), n.created_at;

-- Rewrite note tags to use the canonical spelling from the tags table.
UPDATE public.notes n
SET tags = canon.tags
FROM (
  SELECT n2.id,
         public.dedupe_tags_ci(array(
           SELECT COALESCE(tg.name, public.normalize_tag_name(u.t))
           FROM unnest(n2.tags) WITH ORDINALITY AS u(t, ord)
           LEFT JOIN public.tags tg
             ON tg.user_id = n2.user_id
            AND lower(tg.name) = lower(public.normalize_tag_name(u.t))
           ORDER BY u.ord
         )) AS tags
  FROM public.notes n2
) canon
WHERE n.id = canon.id
  AND n.tags IS DISTINCT FROM canon.tags;

-- Same for flashcards. Flashcard-only tags (not in the tags table) keep their spelling.
UPDATE public.flashcards f
SET tags = canon.tags,
    updated_at = NOW()
FROM (
  SELECT f2.id,
         public.dedupe_tags_ci(array(
           SELECT COALESCE(tg.name, public.normalize_tag_name(u.t))
           FROM unnest(f2.tags) WITH ORDINALITY AS u(t, ord)
           LEFT JOIN public.tags tg
             ON tg.user_id::text = f2.user_id::text
            AND lower(tg.name) = lower(public.normalize_tag_name(u.t))
           ORDER BY u.ord
         )) AS tags
  FROM public.flashcards f2
) canon
WHERE f.id = canon.id
  AND f.tags IS DISTINCT FROM canon.tags;

-- ----------------------------------------------------------------------------
-- Constraints and indexes
-- ----------------------------------------------------------------------------

-- One tag per name per user, ignoring case.
CREATE UNIQUE INDEX IF NOT EXISTS tags_user_id_lower_name_key
  ON public.tags (user_id, lower(name));

-- Tag names cannot be blank or longer than 50 characters.
ALTER TABLE public.tags DROP CONSTRAINT IF EXISTS tags_name_check;
ALTER TABLE public.tags
  ADD CONSTRAINT tags_name_check CHECK (char_length(btrim(name)) BETWEEN 1 AND 50) NOT VALID;

-- Remove a user's tags when the account is deleted, like notes.
ALTER TABLE public.tags DROP CONSTRAINT IF EXISTS tags_user_id_fkey;
ALTER TABLE public.tags
  ADD CONSTRAINT tags_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Speed up tag filters (contains / overlaps).
CREATE INDEX IF NOT EXISTS notes_tags_gin_idx ON public.notes USING gin (tags);
CREATE INDEX IF NOT EXISTS flashcards_tags_gin_idx ON public.flashcards USING gin (tags);

-- ----------------------------------------------------------------------------
-- rename_tag: rename a tag in the tags table, notes and flashcards
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rename_tag(p_tag_id uuid, p_new_name text)
RETURNS public.tags
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_old text;
  v_new text := public.normalize_tag_name(p_new_name);
  v_tag public.tags;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF v_new = '' THEN
    RAISE EXCEPTION 'Tag name is required' USING ERRCODE = '22023';
  END IF;

  IF char_length(v_new) > 50 THEN
    RAISE EXCEPTION 'Tag name must be 50 characters or fewer' USING ERRCODE = '22023';
  END IF;

  SELECT name INTO v_old
  FROM public.tags
  WHERE id = p_tag_id AND user_id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tag not found' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.tags
    WHERE user_id = v_uid AND lower(name) = lower(v_new) AND id <> p_tag_id
  ) THEN
    RAISE EXCEPTION 'A tag with this name already exists' USING ERRCODE = '23505';
  END IF;

  UPDATE public.tags SET name = v_new WHERE id = p_tag_id
  RETURNING * INTO v_tag;

  UPDATE public.notes
  SET tags = public.dedupe_tags_ci(array(
    SELECT CASE WHEN lower(t) = lower(v_old) THEN v_new ELSE t END
    FROM unnest(tags) WITH ORDINALITY AS u(t, ord)
    ORDER BY ord
  ))
  WHERE user_id = v_uid
    AND EXISTS (SELECT 1 FROM unnest(tags) t WHERE lower(t) = lower(v_old));

  UPDATE public.flashcards
  SET tags = public.dedupe_tags_ci(array(
        SELECT CASE WHEN lower(t) = lower(v_old) THEN v_new ELSE t END
        FROM unnest(tags) WITH ORDINALITY AS u(t, ord)
        ORDER BY ord
      )),
      updated_at = NOW()
  WHERE user_id::text = v_uid::text
    AND EXISTS (SELECT 1 FROM unnest(tags) t WHERE lower(t) = lower(v_old));

  RETURN v_tag;
END;
$$;

-- ----------------------------------------------------------------------------
-- delete_tag: remove a tag from notes and flashcards, then delete it.
-- Returns the number of notes the tag was removed from.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.delete_tag(p_tag_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_name text;
  v_notes integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT name INTO v_name
  FROM public.tags
  WHERE id = p_tag_id AND user_id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tag not found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.notes
  SET tags = array(
    SELECT t FROM unnest(tags) WITH ORDINALITY AS u(t, ord)
    WHERE lower(t) <> lower(v_name)
    ORDER BY ord
  )
  WHERE user_id = v_uid
    AND EXISTS (SELECT 1 FROM unnest(tags) t WHERE lower(t) = lower(v_name));
  GET DIAGNOSTICS v_notes = ROW_COUNT;

  UPDATE public.flashcards
  SET tags = array(
        SELECT t FROM unnest(tags) WITH ORDINALITY AS u(t, ord)
        WHERE lower(t) <> lower(v_name)
        ORDER BY ord
      ),
      updated_at = NOW()
  WHERE user_id::text = v_uid::text
    AND EXISTS (SELECT 1 FROM unnest(tags) t WHERE lower(t) = lower(v_name));

  DELETE FROM public.tags WHERE id = p_tag_id;

  RETURN v_notes;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rename_tag(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_tag(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- search_notes: match tags regardless of case
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.search_notes(search_query text)
RETURNS SETOF public.notes
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM notes
  WHERE
    user_id = auth.uid() AND
    (
      title ILIKE '%' || search_query || '%' OR
      content::TEXT ILIKE '%' || search_query || '%' OR
      EXISTS (SELECT 1 FROM unnest(tags) t WHERE lower(t) = lower(btrim(search_query)))
    )
  ORDER BY created_at DESC;
END;
$$;
