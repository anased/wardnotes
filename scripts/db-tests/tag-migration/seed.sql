-- Synthetic notes for run-tag-migration-tests.sh (two users; one existing topic with an alias).
INSERT INTO public.notes (id, user_id, title, content, category, tags) VALUES
 ('10000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','BAD vs lacunar','{}','Neurology', ARRAY['RITE','Stroke','BAD','Lacunar syndrome','Pathophysiology/mechanism']),
 ('10000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','PRES review','{}','Neurology', ARRAY['PRES','NICU','Clinical pearls']),
 ('10000000-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','Pearls only','{}','Neurology', ARRAY['RITE','Clinical pearls']),
 ('10000000-0000-0000-0000-000000000004','11111111-1111-1111-1111-111111111111','Dropped only','{}','Neurology', ARRAY['RITE']),
 ('10000000-0000-0000-0000-000000000005','11111111-1111-1111-1111-111111111111','RPLS synonym','{}','Neurology', ARRAY['rpls ']),
 ('10000000-0000-0000-0000-000000000006','22222222-2222-2222-2222-222222222222','Other user','{}','Cardiology', ARRAY['Stroke']);
-- A topic the user already made in the app, with an alias
INSERT INTO public.topics (id, user_id, name, aliases) VALUES
 ('20000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','Neurocritical care', ARRAY['NICU']);
