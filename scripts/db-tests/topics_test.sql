-- Behaviour tests for add_topics.sql: cycles, aliases, sections, primary
-- topic, descendant filter, trials, links and RLS. Every "OK ..." notice is a
-- passing check; any ERROR is a failure.
\set ON_ERROR_STOP 1
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
-- topics
INSERT INTO topics (id,name) VALUES
 ('a0000000-0000-0000-0000-000000000001','Neurology'),
 ('a0000000-0000-0000-0000-000000000002','Cerebrovascular'),
 ('a0000000-0000-0000-0000-000000000003','Neurocritical care'),
 ('a0000000-0000-0000-0000-000000000004','Small vessel disease'),
 ('a0000000-0000-0000-0000-000000000005','Branch atheromatous disease'),
 ('a0000000-0000-0000-0000-000000000007','Secondary prevention'),
 ('a0000000-0000-0000-0000-000000000008','TIA');
INSERT INTO topics (id,name,aliases) VALUES ('a0000000-0000-0000-0000-000000000006','  PRES ', ARRAY['RPLS','Posterior reversible encephalopathy syndrome',' rpls ','pres','']);
SELECT name, aliases FROM topics WHERE name='PRES';
INSERT INTO topic_edges(parent_id,child_id) VALUES
 ('a0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002'),
 ('a0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000003'),
 ('a0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000004'),
 ('a0000000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-000000000005'),
 ('a0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000006'),
 ('a0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000006'),
 ('a0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000007'),
 ('a0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000008');
-- cycle
DO $$ BEGIN
  INSERT INTO topic_edges(parent_id,child_id) VALUES ('a0000000-0000-0000-0000-000000000005','a0000000-0000-0000-0000-000000000001');
  RAISE EXCEPTION 'cycle not blocked';
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'OK cycle blocked: %', SQLERRM; END $$;
-- duplicate name
DO $$ BEGIN INSERT INTO topics(name) VALUES ('pres'); RAISE EXCEPTION 'dup allowed';
EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'OK dup name blocked'; END $$;
SELECT 'RPLS search' t, name, matched_alias, rank FROM search_topics('rpls');
SELECT 'pre search' t, name, matched_alias, rank FROM search_topics('pre');
SELECT 'wildcard' t, count(*) FROM search_topics('%');
DO $$ BEGIN
  ASSERT (SELECT name FROM search_topics('RPLS') LIMIT 1) = 'PRES', 'RPLS should find PRES';
  ASSERT (SELECT count(*) FROM search_topics('%')) = 0, 'LIKE wildcards must be escaped';
  RAISE NOTICE 'OK RPLS finds PRES';
END $$;
-- notes
INSERT INTO notes (id,user_id,title,content,category) VALUES
 ('b0000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','PRES MRI','{}','Neurology'),
 ('b0000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','Three topics','{}','Neurology'),
 ('b0000000-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','Unrelated','{}','Neurology');
INSERT INTO topic_sections(id,topic_id,name,sort_order) VALUES ('c0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000006','Diagnosis',0);
-- section must belong to topic
DO $$ BEGIN
 INSERT INTO note_topics(note_id,topic_id,section_id) VALUES ('b0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000004','c0000000-0000-0000-0000-000000000001');
 RAISE EXCEPTION 'cross-topic section allowed';
EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'OK cross-topic section blocked'; END $$;
SELECT set_note_topics('b0000000-0000-0000-0000-000000000001','[{"topic_id":"a0000000-0000-0000-0000-000000000006","section_id":"c0000000-0000-0000-0000-000000000001"}]');
SELECT set_note_topics('b0000000-0000-0000-0000-000000000002','[{"topic_id":"a0000000-0000-0000-0000-000000000007"},{"topic_id":"a0000000-0000-0000-0000-000000000008","is_primary":true},{"topic_id":"a0000000-0000-0000-0000-000000000005"}]');
SELECT 'three-topic note' t, topic_id, is_primary FROM note_topics WHERE note_id='b0000000-0000-0000-0000-000000000002' ORDER BY topic_id;
-- switch primary
SELECT set_note_topics('b0000000-0000-0000-0000-000000000002','[{"topic_id":"a0000000-0000-0000-0000-000000000007","is_primary":true},{"topic_id":"a0000000-0000-0000-0000-000000000008"},{"topic_id":"a0000000-0000-0000-0000-000000000005"}]');
SELECT 'switched' t, count(*) FILTER (WHERE is_primary) prim, bool_or(is_primary AND topic_id='a0000000-0000-0000-0000-000000000007') ok FROM note_topics WHERE note_id='b0000000-0000-0000-0000-000000000002';
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM note_topics WHERE note_id='b0000000-0000-0000-0000-000000000002') = 3, 'three links';
  ASSERT (SELECT count(*) FROM note_topics WHERE note_id='b0000000-0000-0000-0000-000000000002' AND is_primary) = 1, 'one primary';
  RAISE NOTICE 'OK note on three topics with one primary';
END $$;
SELECT 'Cerebrovascular filter' t, title FROM notes_in_topic('a0000000-0000-0000-0000-000000000002') ORDER BY title;
SELECT 'Neurocritical direct-only' t, count(*) FROM notes_in_topic('a0000000-0000-0000-0000-000000000003', false);
SELECT 'descendants of Neurology' t, count(*) FROM topic_descendants('a0000000-0000-0000-0000-000000000001');
DO $$ BEGIN
  ASSERT EXISTS (SELECT 1 FROM notes_in_topic('a0000000-0000-0000-0000-000000000002') WHERE title='PRES MRI'), 'Cerebrovascular includes PRES notes';
  ASSERT (SELECT count(*) FROM topic_edges WHERE child_id='a0000000-0000-0000-0000-000000000006') = 2, 'PRES has two parents';
  ASSERT (SELECT count(*) FROM topic_descendants('a0000000-0000-0000-0000-000000000001')) = 8, 'PRES counted once under Neurology';
  RAISE NOTICE 'OK descendant filter and multi-parent PRES';
END $$;
-- delete section -> unsorted
DELETE FROM topic_sections WHERE id='c0000000-0000-0000-0000-000000000001';
SELECT 'after section delete' t, section_id IS NULL unsorted FROM note_topics WHERE note_id='b0000000-0000-0000-0000-000000000001';
-- delete primary topic -> promote
DELETE FROM topics WHERE id='a0000000-0000-0000-0000-000000000007';
SELECT 'after primary topic delete' t, count(*) links, count(*) FILTER (WHERE is_primary) prim FROM note_topics WHERE note_id='b0000000-0000-0000-0000-000000000002';
DO $$ BEGIN
  ASSERT (SELECT section_id IS NULL FROM note_topics WHERE note_id='b0000000-0000-0000-0000-000000000001'), 'deleted section -> Unsorted';
  ASSERT (SELECT count(*) FROM note_topics WHERE note_id='b0000000-0000-0000-0000-000000000002' AND is_primary) = 1, 'primary promoted';
  RAISE NOTICE 'OK section delete keeps link; primary promoted';
END $$;
-- trials
INSERT INTO trials(id,acronym,year,full_name) VALUES ('d0000000-0000-0000-0000-000000000001','POINT',2018,'Platelet-Oriented Inhibition in New TIA'),('d0000000-0000-0000-0000-000000000002','THALES',2020,null);
DO $$ BEGIN INSERT INTO trials(acronym,year) VALUES ('point',2018); RAISE EXCEPTION 'dup trial';
EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'OK dup trial blocked'; END $$;
SELECT set_trial_topics('d0000000-0000-0000-0000-000000000001','[{"topic_id":"a0000000-0000-0000-0000-000000000008"},{"topic_id":"a0000000-0000-0000-0000-000000000004"}]');
SELECT 'POINT topics' t, count(*) FROM trial_topics WHERE trial_id='d0000000-0000-0000-0000-000000000001';
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM trials WHERE lower(acronym)='point') = 1, 'POINT once';
  ASSERT (SELECT count(*) FROM trial_topics WHERE trial_id='d0000000-0000-0000-0000-000000000001') = 2, 'POINT under two topics';
  RAISE NOTICE 'OK POINT is one record under two topics';
END $$;
-- links
INSERT INTO note_links(source_type,source_id,target_type,target_id,relation) VALUES ('note','b0000000-0000-0000-0000-000000000002','trial','d0000000-0000-0000-0000-000000000001','cites'),('note','b0000000-0000-0000-0000-000000000003','note','b0000000-0000-0000-0000-000000000002','answers');
DO $$ BEGIN INSERT INTO note_links(source_type,source_id,target_type,target_id,relation) VALUES ('note','b0000000-0000-0000-0000-000000000003','trial','d0000000-0000-0000-0000-00000000dead','cites'); RAISE EXCEPTION 'bad link';
EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'OK dangling link blocked'; END $$;
UPDATE trials SET superseded_by='d0000000-0000-0000-0000-000000000002' WHERE acronym='POINT';
DELETE FROM notes WHERE id='b0000000-0000-0000-0000-000000000003';
SELECT 'links after note delete' t, count(*) FROM note_links;
DELETE FROM trials WHERE acronym='THALES';
SELECT 'superseded cleared' t, superseded_by IS NULL FROM trials WHERE acronym='POINT';
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM note_links) = 1, 'links to deleted note removed';
  ASSERT (SELECT superseded_by IS NULL FROM trials WHERE acronym='POINT'), 'superseded_by cleared';
  RAISE NOTICE 'OK link cleanup and superseded_by';
END $$;
SELECT reorder_topic_sections('a0000000-0000-0000-0000-000000000006', ARRAY[]::uuid[]);
SELECT 'counts' t, * FROM topic_note_counts() ORDER BY 2 DESC LIMIT 2;
-- RLS: other user
SELECT set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
SELECT 'other user sees' t, (SELECT count(*) FROM topics) topics, (SELECT count(*) FROM note_topics) nt, (SELECT count(*) FROM trials) trials, (SELECT count(*) FROM note_links) links, (SELECT count(*) FROM search_topics('rpls')) srch;
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM topics) = 0 AND (SELECT count(*) FROM trials) = 0 AND (SELECT count(*) FROM note_links) = 0, 'RLS isolation';
  RAISE NOTICE 'OK other user sees nothing';
END $$;
DO $$ BEGIN INSERT INTO topic_edges(parent_id,child_id,user_id) VALUES ('a0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000004','11111111-1111-1111-1111-111111111111'); RAISE EXCEPTION 'rls hole';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'OK RLS blocks spoofed user_id'; END $$;
INSERT INTO topics(id,name) VALUES ('e0000000-0000-0000-0000-000000000001','Mine');
DO $$ BEGIN INSERT INTO topic_edges(parent_id,child_id) VALUES ('e0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000004'); RAISE EXCEPTION 'cross-user edge';
EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'OK cross-user edge blocked'; END $$;
-- anon
RESET ROLE; SET ROLE anon;
DO $$ BEGIN PERFORM count(*) FROM topics; RAISE EXCEPTION 'anon can read'; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'OK anon blocked'; END $$;
