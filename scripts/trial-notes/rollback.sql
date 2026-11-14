--
-- Undo the trial-notes migration: removes trials, trial -> topic links and
-- note links added since the snapshot taken by the first committed run of the
-- apply script (backup.*_pre_trialnotes), and gives notes their type back.
--
-- CAUTION: this also removes trials and links you added in the app after the
-- migration, because it can't tell them apart. Every note that was typed
-- Trial in the snapshot and isn't now is typed Trial again (including a type
-- you changed by hand since). Rows that existed before the migration are kept.
--
-- Run it before rolling back the tag migration (which removes topics).
-- Dry run by default: ends with ROLLBACK and reports what would change.
-- Change ROLLBACK to COMMIT to apply.
--

BEGIN;

DO $$
BEGIN
  IF to_regclass('backup.trials_pre_trialnotes') IS NULL THEN
    RAISE EXCEPTION 'No snapshot found (backup.trials_pre_trialnotes): the migration was never committed.';
  END IF;
END $$;

CREATE TEMP TABLE tn_undone (what text, n bigint) ON COMMIT DROP;

WITH d AS (
  DELETE FROM public.note_links l
  WHERE NOT EXISTS (SELECT 1 FROM backup.note_links_pre_trialnotes b WHERE b.id = l.id)
  RETURNING 1
) INSERT INTO tn_undone SELECT 'note links removed', count(*) FROM d;

WITH d AS (
  DELETE FROM public.trial_topics tt
  WHERE NOT EXISTS (SELECT 1 FROM backup.trial_topics_pre_trialnotes b WHERE b.trial_id = tt.trial_id AND b.topic_id = tt.topic_id)
  RETURNING 1
) INSERT INTO tn_undone SELECT 'trial -> topic links removed', count(*) FROM d;

WITH d AS (
  DELETE FROM public.trials t
  WHERE NOT EXISTS (SELECT 1 FROM backup.trials_pre_trialnotes b WHERE b.id = t.id)
  RETURNING 1
) INSERT INTO tn_undone SELECT 'trials removed', count(*) FROM d;

WITH u AS (
  UPDATE public.notes n
  SET content_type = 'trial'
  FROM backup.note_types_pre_trialnotes b
  WHERE b.id = n.id AND b.content_type = 'trial' AND n.content_type IS DISTINCT FROM 'trial'
  RETURNING 1
) INSERT INTO tn_undone SELECT 'notes typed Trial again', count(*) FROM u;

SELECT what, n FROM tn_undone;

ROLLBACK;  -- dry run. Change to COMMIT to apply.
