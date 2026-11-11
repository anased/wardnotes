--
-- Rollback for taxonomy_cleanup_20261111.sql
--
-- Restores, for the one account the cleanup touched, notes.tags,
-- notes.category, flashcards.tags and the tags/categories rows from the
-- backup snapshot (backup_before_taxonomy_cleanup.sql).
--
-- Note: tag/category edits made to those notes AFTER the snapshot are
-- overwritten. Notes created after the snapshot are left alone.
--
-- Ends with ROLLBACK by default; change to COMMIT to apply.
--

BEGIN;

CREATE TEMP TABLE rollback_user ON COMMIT DROP AS
SELECT '5079b1fe-6b16-444b-9556-927b6879666d'::uuid AS user_id;

UPDATE public.notes n
SET tags = b.tags, category = b.category
FROM backup.notes_20261111 b
WHERE b.id = n.id
  AND n.user_id IN (SELECT user_id FROM rollback_user)
  AND (n.tags IS DISTINCT FROM b.tags OR n.category IS DISTINCT FROM b.category);

UPDATE public.flashcards f
SET tags = b.tags
FROM backup.flashcards_20261111 b
WHERE b.id = f.id
  AND f.user_id IN (SELECT user_id FROM rollback_user)
  AND f.tags IS DISTINCT FROM b.tags;

DELETE FROM public.tags WHERE user_id IN (SELECT user_id FROM rollback_user);
INSERT INTO public.tags SELECT * FROM backup.tags_20261111
WHERE user_id IN (SELECT user_id FROM rollback_user);

DELETE FROM public.categories WHERE user_id IN (SELECT user_id FROM rollback_user);
INSERT INTO public.categories SELECT * FROM backup.categories_20261111
WHERE user_id IN (SELECT user_id FROM rollback_user);

-- Report: rows that still differ from the snapshot (expect 0 / 0).
SELECT
  (SELECT count(*) FROM public.notes n JOIN backup.notes_20261111 b USING (id)
   WHERE n.user_id IN (SELECT user_id FROM rollback_user)
     AND (n.tags IS DISTINCT FROM b.tags OR n.category IS DISTINCT FROM b.category)) AS notes_differing,
  (SELECT count(*) FROM public.flashcards f JOIN backup.flashcards_20261111 b USING (id)
   WHERE f.user_id IN (SELECT user_id FROM rollback_user)
     AND f.tags IS DISTINCT FROM b.tags) AS flashcards_differing;

ROLLBACK;  -- change to COMMIT to apply
