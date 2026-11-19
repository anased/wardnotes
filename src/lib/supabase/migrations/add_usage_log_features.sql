--
-- Separate feature labels in api_usage_logs
--
-- Answer-questions and trial extraction share the note_improvement *quota*, but
-- should be logged under their own labels so cost per feature is visible.
-- Additive: existing values stay valid, so this is safe to apply before deploy.
--

ALTER TABLE public.api_usage_logs DROP CONSTRAINT IF EXISTS valid_feature_type;
ALTER TABLE public.api_usage_logs ADD CONSTRAINT valid_feature_type CHECK (
  feature_type IN ('flashcard_generation', 'note_improvement', 'answer_questions', 'trial_extraction')
);
