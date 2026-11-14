-- Synthetic data for run-trial-notes-tests.sh: two users, notes typed Trial,
-- existing trials (one in lower case, one with a year the note lacks), an
-- existing cites link, and topics with a section.
INSERT INTO public.notes (id, user_id, title, content, category, tags, content_type) VALUES
 ('30000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','Aristotle (2011) Trial - Apixaban vs Warfarin','{}','Neurology','{}','trial'),
 ('30000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','Averroes - Apixaban vs Aspirin','{}','Neurology','{}','trial'),
 ('30000000-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','DIFFUSE and DAWN','{}','Neurology','{}','trial'),
 ('30000000-0000-0000-0000-000000000004','11111111-1111-1111-1111-111111111111','The extended window trials','{}','Neurology','{}','trial'),
 ('30000000-0000-0000-0000-000000000006','11111111-1111-1111-1111-111111111111','Already retyped in the app','{}','Neurology','{}','question'),
 ('30000000-0000-0000-0000-000000000007','22222222-2222-2222-2222-222222222222','Aristotle (2011) Trial','{}','Cardiology','{}','trial');

INSERT INTO public.topics (id, user_id, name) VALUES
 ('40000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','Afib'),
 ('40000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','Stroke prevention');
INSERT INTO public.topic_sections (id, topic_id, user_id, name, sort_order) VALUES
 ('41000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','Trials and evidence', 1);
INSERT INTO public.note_topics (note_id, topic_id, user_id, section_id, is_primary) VALUES
 ('30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','41000000-0000-0000-0000-000000000001', true),
 ('30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111', NULL, false),
 ('30000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111', NULL, true);

INSERT INTO public.trials (id, user_id, acronym, year) VALUES
 ('50000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','aristotle', 2011),
 ('50000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','Averroes', 2011);
INSERT INTO public.note_links (user_id, source_type, source_id, target_type, target_id, relation) VALUES
 ('11111111-1111-1111-1111-111111111111','note','30000000-0000-0000-0000-000000000001','trial','50000000-0000-0000-0000-000000000001','cites');
