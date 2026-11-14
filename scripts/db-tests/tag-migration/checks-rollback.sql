-- Assertions after committing scripts/tag-migration/rollback.sql.
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM topics) = 1, 'only the pre-existing topic remains';
  ASSERT (SELECT aliases FROM topics) = ARRAY['NICU'], 'its aliases are restored';
  ASSERT (SELECT count(*) FROM topic_edges) = 0 AND (SELECT count(*) FROM topic_sections) = 0
     AND (SELECT count(*) FROM note_topics) = 1, 'links, sections and edges removed (the app link stays)';
  RAISE NOTICE 'OK rollback';
END $$;
