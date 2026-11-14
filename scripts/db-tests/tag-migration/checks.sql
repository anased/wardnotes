-- Assertions after the first committed run of the tag migration.
DO $$
DECLARE u1 uuid := '11111111-1111-1111-1111-111111111111';
BEGIN
  ASSERT (SELECT count(*) FROM topics WHERE user_id = u1 AND name = 'NICU') = 0, 'NICU reuses Neurocritical care via its alias';
  ASSERT (SELECT count(*) FROM topic_edges e JOIN topics c ON c.id = e.child_id WHERE c.name = 'PRES') = 2, 'PRES has two parents';
  ASSERT (SELECT aliases FROM topics WHERE name = 'PRES') @> ARRAY['RPLS'], 'synonym tag became an alias';
  ASSERT NOT EXISTS (SELECT 1 FROM topic_edges e JOIN topics c ON c.id = e.child_id WHERE c.name = 'Neurology'), 'cycle edge skipped';
  ASSERT (SELECT t.name FROM note_topics nt JOIN topics t ON t.id = nt.topic_id
          WHERE nt.note_id = '10000000-0000-0000-0000-000000000001' AND nt.is_primary) = 'Branch atheromatous disease', 'deepest topic is primary';
  ASSERT (SELECT count(*) FROM note_topics WHERE note_id = '10000000-0000-0000-0000-000000000001') = 3, 'note on three topics';
  ASSERT (SELECT count(*) FROM note_topics WHERE is_primary GROUP BY note_id ORDER BY 1 DESC LIMIT 1) = 1, 'one primary per note';
  ASSERT (SELECT s.name FROM note_topics nt JOIN topic_sections s ON s.id = nt.section_id
          WHERE nt.note_id = '10000000-0000-0000-0000-000000000005') = 'Diagnosis', 'topic row section applied';
  ASSERT (SELECT t.name FROM note_topics nt JOIN topics t ON t.id = nt.topic_id
          WHERE nt.note_id = '10000000-0000-0000-0000-000000000003') = 'Neurology', 'section-only note falls back to its category';
  -- Category fallback: every note without a topic goes under its category's topic (primary)
  ASSERT (SELECT t.name FROM note_topics nt JOIN topics t ON t.id = nt.topic_id
          WHERE nt.note_id = '10000000-0000-0000-0000-000000000004' AND nt.is_primary) = 'Neurology', 'kept-label-only note filed under its category';
  ASSERT (SELECT t.name FROM note_topics nt JOIN topics t ON t.id = nt.topic_id
          WHERE nt.note_id = '10000000-0000-0000-0000-000000000007' AND nt.is_primary) = 'Cardiology', 'untagged note filed under its category (topic created)';
  ASSERT (SELECT t.name || '/' || t.user_id FROM note_topics nt JOIN topics t ON t.id = nt.topic_id
          WHERE nt.note_id = '10000000-0000-0000-0000-000000000010' AND nt.is_primary) = 'neurology/22222222-2222-2222-2222-222222222222', 'other user''s untagged note filed under their own topic';
  ASSERT NOT EXISTS (SELECT 1 FROM note_topics WHERE note_id IN ('10000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000009')), 'notes without a category stay unfiled';
  ASSERT (SELECT array_agg(topic_id::text) FROM note_topics WHERE note_id = '10000000-0000-0000-0000-000000000011') = ARRAY['20000000-0000-0000-0000-000000000001'], 'a note filed in the app is left alone';
  ASSERT (SELECT count(*) FROM notes n WHERE NOT EXISTS (SELECT 1 FROM note_topics nt WHERE nt.note_id = n.id)) = 2, 'only the two notes without a category are unfiled';
  ASSERT NOT EXISTS (SELECT 1 FROM topics WHERE name = 'RITE'), 'kept label creates no topic';
  ASSERT NOT EXISTS (SELECT 1 FROM topic_sections WHERE name = 'RITE'), 'kept label creates no section';
  ASSERT (SELECT count(*) FROM topics WHERE name = 'Stroke') = 2, 'each user gets their own topic';
  ASSERT (SELECT tags FROM notes WHERE id = '10000000-0000-0000-0000-000000000001') = ARRAY['RITE','Stroke','BAD','Lacunar syndrome','Pathophysiology/mechanism'], 'notes.tags untouched';
  RAISE NOTICE 'OK first run';
END $$;

-- Edits made in the app after the migration
UPDATE note_topics SET section_id = NULL WHERE note_id = '10000000-0000-0000-0000-000000000005';
UPDATE note_topics SET is_primary = false WHERE note_id = '10000000-0000-0000-0000-000000000001';
UPDATE note_topics SET is_primary = true
WHERE note_id = '10000000-0000-0000-0000-000000000001' AND topic_id = (SELECT id FROM topics WHERE name = 'Lacunar syndrome');
CREATE TABLE counts_before AS
SELECT (SELECT count(*) FROM topics) t, (SELECT count(*) FROM topic_edges) e, (SELECT count(*) FROM topic_sections) s, (SELECT count(*) FROM note_topics) l;
