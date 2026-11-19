--
-- Refund Usage Migration
-- Gives back one unit of AI-feature quota when a request was charged but the
-- AI call (or saving its result) failed, so users aren't billed for failures.
--
-- Security: SECURITY DEFINER and takes an arbitrary user id, so it must NOT be
-- callable by anon/authenticated clients (they could reset their own quota).
-- Only the service role (server-side API routes) may execute it.
--

CREATE OR REPLACE FUNCTION public.refund_usage(
  p_user_id UUID,
  p_feature_type TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_quota public.usage_quotas;
BEGIN
  IF p_feature_type = 'flashcard_generation' THEN
    UPDATE public.usage_quotas
    SET flashcard_generations_used = GREATEST(flashcard_generations_used - 1, 0),
        updated_at = NOW()
    WHERE user_id = p_user_id
      AND period_start <= NOW()
      AND period_end > NOW()
    RETURNING * INTO v_quota;
  ELSIF p_feature_type = 'note_improvement' THEN
    UPDATE public.usage_quotas
    SET note_improvements_used = GREATEST(note_improvements_used - 1, 0),
        updated_at = NOW()
    WHERE user_id = p_user_id
      AND period_start <= NOW()
      AND period_end > NOW()
    RETURNING * INTO v_quota;
  ELSE
    RETURN jsonb_build_object('refunded', FALSE, 'message', 'Invalid feature type');
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('refunded', FALSE, 'message', 'No quota for current period');
  END IF;

  RETURN jsonb_build_object('refunded', TRUE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.refund_usage(UUID, TEXT) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_usage(UUID, TEXT) TO service_role;
