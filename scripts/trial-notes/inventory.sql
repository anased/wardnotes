-- Trial-note inventory for the "Trial" type phase-out. READ-ONLY (only SELECTs).
--
-- Run in the Supabase SQL editor (or via the Supabase MCP). It returns one
-- row with one JSON cell: save it as scripts/trial-notes/out/inventory.json,
-- then run:
--   node scripts/trial-notes/trial-notes.mjs export scripts/trial-notes/out/inventory.json
--
-- notes:  every note with content_type = 'trial': note_id, user_id, title,
--         created_at, topic_ids and topics (primary first)
-- trials: existing trial records (user_id, acronym, year), so the draft can
--         say which notes would link to a trial that already exists

SELECT jsonb_build_object(
  'notes', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'note_id', n.id,
             'user_id', n.user_id,
             'title', n.title,
             'created_at', n.created_at,
             'topic_ids', COALESCE((
               SELECT jsonb_agg(nt.topic_id ORDER BY nt.is_primary DESC, t.name)
               FROM public.note_topics nt JOIN public.topics t ON t.id = nt.topic_id
               WHERE nt.note_id = n.id), '[]'::jsonb),
             'topics', COALESCE((
               SELECT jsonb_agg(t.name ORDER BY nt.is_primary DESC, t.name)
               FROM public.note_topics nt JOIN public.topics t ON t.id = nt.topic_id
               WHERE nt.note_id = n.id), '[]'::jsonb)
           ) ORDER BY n.user_id, n.created_at)
    FROM public.notes n
    WHERE n.content_type = 'trial'), '[]'::jsonb),
  'trials', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('user_id', tr.user_id, 'acronym', tr.acronym, 'year', tr.year)
           ORDER BY tr.user_id, lower(tr.acronym))
    FROM public.trials tr), '[]'::jsonb)
) AS inventory;
