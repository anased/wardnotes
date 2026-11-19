--
-- Per-call AI usage details in api_usage_logs
--
-- Every AI call is now logged as its own row with the task, provider, model that
-- served it, and input/output tokens (api_cost stays the estimated USD cost and
-- tokens_used the total). Additive and nullable: safe to apply before or after
-- deploy (the app falls back to the old columns until this is applied).
--

ALTER TABLE public.api_usage_logs
  ADD COLUMN IF NOT EXISTS ai_task TEXT,
  ADD COLUMN IF NOT EXISTS provider TEXT,
  ADD COLUMN IF NOT EXISTS model TEXT,
  ADD COLUMN IF NOT EXISTS input_tokens INTEGER,
  ADD COLUMN IF NOT EXISTS output_tokens INTEGER;

CREATE INDEX IF NOT EXISTS idx_api_usage_logs_model
  ON public.api_usage_logs(model, created_at DESC);
