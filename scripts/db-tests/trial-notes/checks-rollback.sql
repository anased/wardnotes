-- Assertions after committing scripts/trial-notes/rollback.sql.
DO $$
BEGIN
  ASSERT (SELECT array_agg(id::text ORDER BY id) FROM trials) =
         ARRAY['50000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000002'], 'only the pre-existing trials remain';
  ASSERT (SELECT count(*) FROM note_links) = 1 AND (SELECT count(*) FROM trial_topics) = 0, 'added links removed, the old one kept';
  ASSERT (SELECT count(*) FROM notes WHERE content_type = 'trial') = 5, 'notes typed Trial again';
  ASSERT (SELECT content_type FROM notes WHERE id = '30000000-0000-0000-0000-000000000006') = 'question', 'note that was not Trial is left alone';
  ASSERT (SELECT count(*) FROM topics) = 2 AND (SELECT count(*) FROM note_topics) = 3, 'topics untouched';
  RAISE NOTICE 'OK rollback';
END $$;
