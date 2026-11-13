--
-- Undo the tag -> topic migration: removes topics, parent links, sections
-- and note links added since the snapshot taken by the first committed run
-- of the apply script (backup.*_pre_tagmap).
--
-- CAUTION: this also removes anything you added in the app after the
-- migration (topics, sections, links), because it can't tell them apart.
-- Rows that existed before the migration are kept. notes.tags is untouched.
--
-- Dry run by default: ends with ROLLBACK and reports what would be removed.
-- Change ROLLBACK to COMMIT to apply.
--

BEGIN;

DO $$
BEGIN
  IF to_regclass('backup.topics_pre_tagmap') IS NULL THEN
    RAISE EXCEPTION 'No snapshot found (backup.topics_pre_tagmap): the migration was never committed.';
  END IF;
END $$;

CREATE TEMP TABLE tm_removed (what text, n bigint) ON COMMIT DROP;

WITH d AS (
  DELETE FROM public.note_topics nt
  WHERE NOT EXISTS (SELECT 1 FROM backup.note_topics_pre_tagmap b WHERE b.note_id = nt.note_id AND b.topic_id = nt.topic_id)
  RETURNING 1
) INSERT INTO tm_removed SELECT 'note links', count(*) FROM d;

-- Links that existed before get their original section and primary flag back
UPDATE public.note_topics nt
SET section_id = b.section_id, is_primary = b.is_primary
FROM backup.note_topics_pre_tagmap b
WHERE b.note_id = nt.note_id AND b.topic_id = nt.topic_id
  AND (nt.section_id IS DISTINCT FROM b.section_id OR nt.is_primary IS DISTINCT FROM b.is_primary)
  AND (NOT b.is_primary OR NOT EXISTS (
        SELECT 1 FROM public.note_topics p WHERE p.note_id = nt.note_id AND p.is_primary AND p.topic_id <> nt.topic_id));

WITH d AS (
  DELETE FROM public.topic_sections s
  WHERE NOT EXISTS (SELECT 1 FROM backup.topic_sections_pre_tagmap b WHERE b.id = s.id)
  RETURNING 1
) INSERT INTO tm_removed SELECT 'sections', count(*) FROM d;

WITH d AS (
  DELETE FROM public.topic_edges e
  WHERE NOT EXISTS (SELECT 1 FROM backup.topic_edges_pre_tagmap b WHERE b.parent_id = e.parent_id AND b.child_id = e.child_id)
  RETURNING 1
) INSERT INTO tm_removed SELECT 'parent links', count(*) FROM d;

WITH d AS (
  DELETE FROM public.topics t
  WHERE NOT EXISTS (SELECT 1 FROM backup.topics_pre_tagmap b WHERE b.id = t.id)
  RETURNING 1
) INSERT INTO tm_removed SELECT 'topics', count(*) FROM d;

-- Aliases added to topics that existed before
UPDATE public.topics t
SET aliases = b.aliases
FROM backup.topics_pre_tagmap b
WHERE b.id = t.id AND t.aliases IS DISTINCT FROM b.aliases;

SELECT what AS removed, n FROM tm_removed;

ROLLBACK;  -- dry run. Change to COMMIT to apply.
