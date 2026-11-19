-- Rollback for add_usage_log_features.sql
-- Fails if rows with the new labels exist; relabel or delete them first.
ALTER TABLE public.api_usage_logs DROP CONSTRAINT IF EXISTS valid_feature_type;
ALTER TABLE public.api_usage_logs ADD CONSTRAINT valid_feature_type CHECK (
  feature_type IN ('flashcard_generation', 'note_improvement')
);
