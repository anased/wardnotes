-- Assertions after committing scripts/tag-migration/rollback.sql.
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM topics) = 2, 'only the pre-existing topics remain';
  ASSERT (SELECT aliases FROM topics WHERE name = 'Neurocritical care') = ARRAY['NICU'], 'aliases are restored';
  ASSERT (SELECT name || '/' || cardinality(aliases) FROM topics WHERE id = '20000000-0000-0000-0000-000000000002') = 'Ischemic stroke/0', 'merged topic gets its name back';
  ASSERT (SELECT count(*) FROM topic_edges) = 0 AND (SELECT count(*) FROM topic_sections) = 0
     AND (SELECT count(*) FROM note_topics) = 1, 'links, sections and edges removed (the app link stays)';
  RAISE NOTICE 'OK rollback';
END $$;
