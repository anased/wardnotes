-- Assertions after the first committed run of the trial-notes migration.
DO $$
DECLARE
  u1 uuid := '11111111-1111-1111-1111-111111111111';
  u2 uuid := '22222222-2222-2222-2222-222222222222';
  aristotle uuid := '50000000-0000-0000-0000-000000000001';
BEGIN
  ASSERT (SELECT count(*) FROM trials WHERE user_id = u1) = 4, 'user 1: 2 existing + DEFUSE 3 + DAWN';
  ASSERT (SELECT count(*) FROM trials WHERE user_id = u2 AND acronym = 'ARISTOTLE' AND year = 2011) = 1, 'user 2 gets their own trial';
  ASSERT NOT EXISTS (SELECT 1 FROM trials WHERE acronym = 'GHOST'), 'row for a missing note is ignored';
  ASSERT (SELECT count(*) FROM note_links WHERE source_id = '30000000-0000-0000-0000-000000000001') = 1, 'existing cites link reused (case-insensitive acronym)';
  ASSERT (SELECT target_id FROM note_links WHERE source_id = '30000000-0000-0000-0000-000000000002' AND relation = 'cites') = '50000000-0000-0000-0000-000000000002', 'no-year row reuses the only Averroes';
  ASSERT (SELECT count(*) FROM note_links l JOIN trials t ON t.id = l.target_id
          WHERE l.source_id = '30000000-0000-0000-0000-000000000003' AND l.relation = 'cites' AND t.acronym IN ('DEFUSE 3', 'DAWN')) = 2, 'one note cites two trials';
  ASSERT (SELECT target_id FROM note_links WHERE source_id = '30000000-0000-0000-0000-000000000006') = aristotle, 'retyped note still linked';
  ASSERT (SELECT section_id FROM trial_topics WHERE trial_id = aristotle AND topic_id = '40000000-0000-0000-0000-000000000001') = '41000000-0000-0000-0000-000000000001', 'trial filed in the note''s section';
  ASSERT (SELECT count(*) FROM trial_topics WHERE trial_id = aristotle) = 2, 'trial on both of the note''s topics';
  ASSERT (SELECT count(*) FROM trial_topics WHERE trial_id = '50000000-0000-0000-0000-000000000002') = 1, 'Averroes on Afib';
  ASSERT (SELECT content_type FROM notes WHERE id = '30000000-0000-0000-0000-000000000001') = 'article', 'new_type honoured';
  ASSERT (SELECT array_agg(content_type ORDER BY id) FROM notes WHERE id IN ('30000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000007')) = ARRAY['review','review','review'], 'default review';
  ASSERT (SELECT content_type FROM notes WHERE id = '30000000-0000-0000-0000-000000000004') = 'trial', 'skipped note untouched';
  ASSERT (SELECT content_type FROM notes WHERE id = '30000000-0000-0000-0000-000000000006') = 'question', 'type changed in the app is kept';
  ASSERT to_regclass('backup.trials_pre_trialnotes') IS NOT NULL AND (SELECT count(*) FROM backup.trials_pre_trialnotes) = 2, 'snapshot taken before the run';
  RAISE NOTICE 'OK first run';
END $$;

-- Edit made in the app after the migration
UPDATE notes SET content_type = 'case' WHERE id = '30000000-0000-0000-0000-000000000002';
CREATE TABLE counts_before AS
SELECT (SELECT count(*) FROM trials) t, (SELECT count(*) FROM trial_topics) tt, (SELECT count(*) FROM note_links) l;
