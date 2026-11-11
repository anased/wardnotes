--
-- Status and content type for notes (2026-11-11)
--
-- Adds two fields so tags only describe topics:
--   * notes.status       'answered' | 'unanswered'  (default 'answered')
--   * notes.content_type 'question' | 'article' | 'trial' | 'review' |
--                        'case' | 'other' | NULL
--
-- Backfill (any user, tag names matched ignoring case):
--   * "Not answered" tag            -> status = 'unanswered'
--   * Question/Answer, Article, Trial(s), Review(s), Case(s)
--                                   -> content_type
--     When a note has several, the first in this order wins:
--     question > review > trial > case > article.
-- The backfilled tags are then removed from notes, flashcards and the tags
-- table.
--
-- * Transactional; DRY RUN BY DEFAULT (ends with ROLLBACK, final SELECT
--   reports the changes). Change ROLLBACK to COMMIT to apply.
-- * Idempotent: columns are added only if missing and only notes that still
--   carry one of the tags are touched.
-- * Takes its own snapshot (backup.*_pre_status) on the first real run;
--   undo with add_status_and_content_type_rollback.sql.
--

BEGIN;

-- Snapshot (kept only when the script is committed)
CREATE SCHEMA IF NOT EXISTS backup;
REVOKE ALL ON SCHEMA backup FROM public, anon, authenticated;
CREATE TABLE IF NOT EXISTS backup.notes_pre_status AS
  SELECT id, user_id, tags FROM public.notes;
CREATE TABLE IF NOT EXISTS backup.flashcards_pre_status AS
  SELECT id, user_id, tags FROM public.flashcards;
CREATE TABLE IF NOT EXISTS backup.tags_pre_status AS
  SELECT * FROM public.tags;
REVOKE ALL ON ALL TABLES IN SCHEMA backup FROM public, anon, authenticated;

-- Columns
ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'answered'
    CONSTRAINT notes_status_check CHECK (status IN ('answered', 'unanswered'));

ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS content_type text
    CONSTRAINT notes_content_type_check
    CHECK (content_type IN ('question', 'article', 'trial', 'review', 'case', 'other'));

CREATE INDEX IF NOT EXISTS notes_user_status_idx ON public.notes (user_id, status);
CREATE INDEX IF NOT EXISTS notes_user_content_type_idx ON public.notes (user_id, content_type);

-- Tag -> field mapping
CREATE TEMP TABLE field_tags (
  tag_key      text PRIMARY KEY,   -- lower-case tag name
  content_type text,
  status       text,
  priority     int
) ON COMMIT DROP;

INSERT INTO field_tags VALUES
  ('question/answer', 'question', NULL, 1),
  ('question',        'question', NULL, 1),
  ('review',          'review',   NULL, 2),
  ('reviews',         'review',   NULL, 2),
  ('trial',           'trial',    NULL, 3),
  ('trials',          'trial',    NULL, 3),
  ('case',            'case',     NULL, 4),
  ('cases',           'case',     NULL, 4),
  ('article',         'article',  NULL, 5),
  ('articles',        'article',  NULL, 5),
  ('not answered',    NULL, 'unanswered', NULL);

CREATE TEMP TABLE status_before ON COMMIT DROP AS
SELECT n.id, n.title, n.tags, n.status, n.content_type
FROM public.notes n
WHERE EXISTS (SELECT 1 FROM unnest(n.tags) t JOIN field_tags f ON f.tag_key = lower(t));

CREATE TEMP TABLE flashcards_status_before ON COMMIT DROP AS
SELECT f.id, f.tags FROM public.flashcards f
WHERE EXISTS (SELECT 1 FROM unnest(f.tags) t JOIN field_tags ft ON ft.tag_key = lower(t));

CREATE TEMP TABLE field_tag_rows_before ON COMMIT DROP AS
SELECT tg.* FROM public.tags tg JOIN field_tags f ON f.tag_key = lower(tg.name);

-- Backfill
UPDATE public.notes n
SET content_type = (
      SELECT f.content_type
      FROM unnest(n.tags) t JOIN field_tags f ON f.tag_key = lower(t)
      WHERE f.content_type IS NOT NULL
      ORDER BY f.priority
      LIMIT 1)
WHERE n.id IN (SELECT id FROM status_before)
  AND n.content_type IS NULL
  AND EXISTS (SELECT 1 FROM unnest(n.tags) t JOIN field_tags f ON f.tag_key = lower(t)
              WHERE f.content_type IS NOT NULL);

UPDATE public.notes n
SET status = 'unanswered'
WHERE n.id IN (SELECT id FROM status_before)
  AND EXISTS (SELECT 1 FROM unnest(n.tags) t JOIN field_tags f ON f.tag_key = lower(t)
              WHERE f.status = 'unanswered');

-- Remove the backfilled tags
UPDATE public.notes n
SET tags = array(
  SELECT t FROM unnest(n.tags) WITH ORDINALITY AS u(t, ord)
  WHERE lower(t) NOT IN (SELECT tag_key FROM field_tags)
  ORDER BY ord)
WHERE n.id IN (SELECT id FROM status_before);

UPDATE public.flashcards f
SET tags = array(
  SELECT t FROM unnest(f.tags) WITH ORDINALITY AS u(t, ord)
  WHERE lower(t) NOT IN (SELECT tag_key FROM field_tags)
  ORDER BY ord)
WHERE f.id IN (SELECT id FROM flashcards_status_before);

DELETE FROM public.tags tg
USING field_tags f
WHERE f.tag_key = lower(tg.name);

-- Report
SELECT * FROM (
  SELECT 1 AS ord, 'summary' AS section, 'notes changed' AS item, count(*)::text AS detail
  FROM status_before
  UNION ALL
  SELECT 1, 'summary', 'flashcards changed', count(*)::text FROM flashcards_status_before
  UNION ALL
  SELECT 1, 'summary', 'tag rows removed',
         COALESCE(string_agg(name, ', ' ORDER BY name), '') FROM field_tag_rows_before
  UNION ALL
  SELECT 2, 'content_type', COALESCE(n.content_type, '(none)'), count(*)::text
  FROM public.notes n GROUP BY n.content_type
  UNION ALL
  SELECT 3, 'status', n.status, count(*)::text
  FROM public.notes n GROUP BY n.status
  UNION ALL
  SELECT 4, 'note', left(b.title, 60),
         array_to_string(b.tags, ', ') || '  =>  type=' || COALESCE(n.content_type, '-')
         || ', status=' || n.status || ', tags=' || array_to_string(n.tags, ', ')
  FROM status_before b JOIN public.notes n USING (id)
) r
ORDER BY ord, section, item;

ROLLBACK;  -- dry run. Change to COMMIT to apply.
