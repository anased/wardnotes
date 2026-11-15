--
-- Undo add_topics.sql: drops the topic, trial and link tables and their
-- functions. DESTROYS every topic, section, trial and link. notes and tags are
-- not touched (the notes (id, user_id) unique constraint is dropped too).
--
-- Dry run by default: ends with ROLLBACK. Change it to COMMIT to apply.
--

BEGIN;

DROP TRIGGER IF EXISTS notes_cleanup_links ON public.notes;

DROP TABLE IF EXISTS public.note_links;
DROP TABLE IF EXISTS public.trial_topics;
DROP TABLE IF EXISTS public.note_topics;
DROP TABLE IF EXISTS public.trials;
DROP TABLE IF EXISTS public.topic_sections;
DROP TABLE IF EXISTS public.topic_edges;
DROP TABLE IF EXISTS public.topics;

DROP FUNCTION IF EXISTS public.reorder_topic_sections(uuid, uuid[]);
DROP FUNCTION IF EXISTS public.set_trial_topics(uuid, jsonb);
DROP FUNCTION IF EXISTS public.set_note_topics(uuid, jsonb);
DROP FUNCTION IF EXISTS public.topic_note_counts();
DROP FUNCTION IF EXISTS public.search_topics(text, integer);
DROP FUNCTION IF EXISTS public.notes_in_topic(uuid, boolean);
DROP FUNCTION IF EXISTS public.topic_descendants(uuid);
DROP FUNCTION IF EXISTS public.note_links_cleanup();
DROP FUNCTION IF EXISTS public.note_links_check_endpoints();
DROP FUNCTION IF EXISTS public.note_topics_keep_primary();
DROP FUNCTION IF EXISTS public.topic_edges_prevent_cycle();
DROP FUNCTION IF EXISTS public.topic_sections_normalize();
DROP FUNCTION IF EXISTS public.topics_normalize();
-- set_updated_at() and normalize_tag_name() are kept: other code may use them.

ALTER TABLE public.notes DROP CONSTRAINT IF EXISTS notes_id_user_id_key;

ROLLBACK;  -- dry run. Change to COMMIT to apply.
