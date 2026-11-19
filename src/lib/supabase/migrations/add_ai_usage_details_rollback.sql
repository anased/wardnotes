--
-- Rollback for add_ai_usage_details.sql (drops the per-call detail columns)
--

DROP INDEX IF EXISTS public.idx_api_usage_logs_model;

ALTER TABLE public.api_usage_logs
  DROP COLUMN IF EXISTS ai_task,
  DROP COLUMN IF EXISTS provider,
  DROP COLUMN IF EXISTS model,
  DROP COLUMN IF EXISTS input_tokens,
  DROP COLUMN IF EXISTS output_tokens;
