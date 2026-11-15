-- Assertions after re-running the committed migration.
DO $$
BEGIN
  ASSERT (SELECT row(t, tt, l)::text FROM counts_before) =
         (SELECT row((SELECT count(*) FROM trials), (SELECT count(*) FROM trial_topics), (SELECT count(*) FROM note_links))::text),
         're-run adds nothing';
  ASSERT (SELECT content_type FROM notes WHERE id = '30000000-0000-0000-0000-000000000002') = 'case', 'type edit kept';
  RAISE NOTICE 'OK re-run keeps edits';
END $$;
DROP TABLE counts_before;
