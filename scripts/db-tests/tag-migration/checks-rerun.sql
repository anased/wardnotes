-- Assertions after re-running the committed migration.
DO $$
BEGIN
  ASSERT (SELECT row(t, e, s, l)::text FROM counts_before) =
         (SELECT row((SELECT count(*) FROM topics), (SELECT count(*) FROM topic_edges),
                     (SELECT count(*) FROM topic_sections), (SELECT count(*) FROM note_topics))::text), 're-run adds nothing';
  ASSERT (SELECT section_id IS NULL FROM note_topics WHERE note_id = '10000000-0000-0000-0000-000000000005'), 'section edit kept';
  ASSERT (SELECT t.name FROM note_topics nt JOIN topics t ON t.id = nt.topic_id
          WHERE nt.note_id = '10000000-0000-0000-0000-000000000001' AND nt.is_primary) = 'Lacunar syndrome', 'primary edit kept';
  RAISE NOTICE 'OK re-run keeps edits';
END $$;
DROP TABLE counts_before;
