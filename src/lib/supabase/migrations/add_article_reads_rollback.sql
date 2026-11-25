--
-- Rollback for add_article_reads.sql
--
-- Drops the Deep Read tables (users' reading lists and primers are lost) and
-- restores the previous api_usage_logs labels. Fails if article_primer /
-- article_guide rows exist in api_usage_logs; delete those first if you
-- really want to roll back:
--   DELETE FROM public.api_usage_logs WHERE feature_type IN ('article_primer', 'article_guide');
--

BEGIN;

DROP TABLE IF EXISTS public.article_guides;
DROP TABLE IF EXISTS public.article_reads;
DROP TABLE IF EXISTS public.article_cache;

ALTER TABLE public.api_usage_logs DROP CONSTRAINT IF EXISTS valid_feature_type;
ALTER TABLE public.api_usage_logs ADD CONSTRAINT valid_feature_type CHECK (
  feature_type IN ('flashcard_generation', 'note_improvement', 'answer_questions', 'trial_extraction')
);

COMMIT;
