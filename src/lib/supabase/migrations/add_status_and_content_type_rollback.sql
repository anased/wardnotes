--
-- Rollback for add_status_and_content_type.sql
--
-- Puts the content-type and "Not answered" tags back on notes and flashcards
-- (from backup.*_pre_status), restores their rows in the tags table, and
-- drops notes.status / notes.content_type.
--
-- Status or content-type changes made after the migration are lost, and tag
-- edits made since then on the affected notes are overwritten.
-- Ends with ROLLBACK by default; change to COMMIT to apply.
--

BEGIN;

-- Tag rows first, so the notes trigger finds them and keeps their ids.
INSERT INTO public.tags
SELECT b.* FROM backup.tags_pre_status b
WHERE lower(b.name) IN ('question/answer', 'question', 'review', 'reviews', 'trial', 'trials',
                        'case', 'cases', 'article', 'articles', 'not answered')
  AND NOT EXISTS (
  SELECT 1 FROM public.tags t
  WHERE t.user_id = b.user_id AND lower(t.name) = lower(b.name)
);

UPDATE public.notes n
SET tags = b.tags
FROM backup.notes_pre_status b
WHERE b.id = n.id AND n.tags IS DISTINCT FROM b.tags
  AND EXISTS (SELECT 1 FROM unnest(b.tags) t
              WHERE lower(t) IN ('question/answer', 'question', 'review', 'reviews', 'trial', 'trials',
                                 'case', 'cases', 'article', 'articles', 'not answered'));

UPDATE public.flashcards f
SET tags = b.tags
FROM backup.flashcards_pre_status b
WHERE b.id = f.id AND f.tags IS DISTINCT FROM b.tags
  AND EXISTS (SELECT 1 FROM unnest(b.tags) t
              WHERE lower(t) IN ('question/answer', 'question', 'review', 'reviews', 'trial', 'trials',
                                 'case', 'cases', 'article', 'articles', 'not answered'));

DROP INDEX IF EXISTS public.notes_user_status_idx;
DROP INDEX IF EXISTS public.notes_user_content_type_idx;
ALTER TABLE public.notes DROP COLUMN IF EXISTS status;
ALTER TABLE public.notes DROP COLUMN IF EXISTS content_type;

-- Report: affected notes/flashcards still differing from the snapshot (expect 0 / 0)
SELECT
  (SELECT count(*) FROM public.notes n JOIN backup.notes_pre_status b USING (id)
   WHERE n.tags IS DISTINCT FROM b.tags
    AND EXISTS (SELECT 1 FROM unnest(b.tags) t
                WHERE lower(t) IN ('question/answer', 'question', 'review', 'reviews', 'trial', 'trials',
                                   'case', 'cases', 'article', 'articles', 'not answered'))) AS notes_differing,
  (SELECT count(*) FROM public.flashcards f JOIN backup.flashcards_pre_status b USING (id)
   WHERE f.tags IS DISTINCT FROM b.tags
    AND EXISTS (SELECT 1 FROM unnest(b.tags) t
                WHERE lower(t) IN ('question/answer', 'question', 'review', 'reviews', 'trial', 'trials',
                                   'case', 'cases', 'article', 'articles', 'not answered'))) AS flashcards_differing;

ROLLBACK;  -- change to COMMIT to apply
