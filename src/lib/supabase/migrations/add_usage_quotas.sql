--
-- Usage Quotas Migration
-- Adds freemium pricing support with monthly usage quotas for AI features
--

-- Create usage_quotas table
CREATE TABLE IF NOT EXISTS public.usage_quotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_start TIMESTAMP WITH TIME ZONE NOT NULL,
  period_end TIMESTAMP WITH TIME ZONE NOT NULL,

  -- Quota limits (null = unlimited for premium users)
  flashcard_generations_limit INTEGER,
  note_improvements_limit INTEGER,

  -- Usage counters
  flashcard_generations_used INTEGER DEFAULT 0 NOT NULL,
  note_improvements_used INTEGER DEFAULT 0 NOT NULL,

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,

  -- Constraints
  CONSTRAINT usage_quotas_user_period_unique UNIQUE(user_id, period_start),
  CONSTRAINT flashcard_generations_used_positive CHECK (flashcard_generations_used >= 0),
  CONSTRAINT note_improvements_used_positive CHECK (note_improvements_used >= 0)
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_usage_quotas_user_period ON public.usage_quotas(user_id, period_start);
CREATE INDEX IF NOT EXISTS idx_usage_quotas_period_range ON public.usage_quotas(period_start, period_end);

-- Enable RLS
ALTER TABLE public.usage_quotas ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own quotas"
  ON public.usage_quotas FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage quotas"
  ON public.usage_quotas FOR ALL
  USING (auth.role() = 'service_role');

-- Optional: Create api_usage_logs table for analytics
CREATE TABLE IF NOT EXISTS public.api_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature_type TEXT NOT NULL,
  api_cost NUMERIC(10, 6) NOT NULL,
  tokens_used INTEGER,
  success BOOLEAN DEFAULT TRUE NOT NULL,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,

  -- Constraints
  CONSTRAINT valid_feature_type CHECK (feature_type IN ('flashcard_generation', 'note_improvement'))
);

-- Create index for analytics queries
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_user_date ON public.api_usage_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_feature ON public.api_usage_logs(feature_type, created_at DESC);

-- Enable RLS
ALTER TABLE public.api_usage_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies for api_usage_logs
CREATE POLICY "Users can view own usage logs"
  ON public.api_usage_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage usage logs"
  ON public.api_usage_logs FOR ALL
  USING (auth.role() = 'service_role');

--
-- Database Functions
--

-- Function: Initialize user quota for current month
CREATE OR REPLACE FUNCTION public.initialize_user_quota(p_user_id UUID)
RETURNS public.usage_quotas AS $$
DECLARE
  v_subscription_plan TEXT;
  v_quota public.usage_quotas;
BEGIN
  -- Get user's subscription plan
  SELECT subscription_plan INTO v_subscription_plan
  FROM public.subscriptions
  WHERE user_id = p_user_id;

  -- Default to 'free' if no subscription found
  IF v_subscription_plan IS NULL THEN
    v_subscription_plan := 'free';
  END IF;

  -- Set quota limits based on plan
  IF v_subscription_plan = 'premium' THEN
    -- Premium: unlimited (null = unlimited)
    INSERT INTO public.usage_quotas (
      user_id,
      period_start,
      period_end,
      flashcard_generations_limit,
      note_improvements_limit,
      flashcard_generations_used,
      note_improvements_used
    ) VALUES (
      p_user_id,
      date_trunc('month', NOW()),
      date_trunc('month', NOW()) + INTERVAL '1 month',
      NULL, -- unlimited
      NULL,  -- unlimited
      0,
      0
    )
    ON CONFLICT (user_id, period_start) DO UPDATE
    SET flashcard_generations_limit = NULL,
        note_improvements_limit = NULL,
        updated_at = NOW()
    RETURNING * INTO v_quota;
  ELSE
    -- Free: limited quotas (3 flashcard generations, 2 note improvements)
    INSERT INTO public.usage_quotas (
      user_id,
      period_start,
      period_end,
      flashcard_generations_limit,
      note_improvements_limit,
      flashcard_generations_used,
      note_improvements_used
    ) VALUES (
      p_user_id,
      date_trunc('month', NOW()),
      date_trunc('month', NOW()) + INTERVAL '1 month',
      3, -- free tier limit
      2,  -- free tier limit
      0,
      0
    )
    ON CONFLICT (user_id, period_start) DO UPDATE
    SET flashcard_generations_limit = 3,
        note_improvements_limit = 2,
        updated_at = NOW()
    RETURNING * INTO v_quota;
  END IF;

  RETURN v_quota;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Check and increment usage
CREATE OR REPLACE FUNCTION public.check_and_increment_usage(
  p_user_id UUID,
  p_feature_type TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_quota public.usage_quotas;
  v_used INTEGER;
  v_limit INTEGER;
BEGIN
  -- Get current period quota
  SELECT * INTO v_quota
  FROM public.usage_quotas
  WHERE user_id = p_user_id
    AND period_start <= NOW()
    AND period_end > NOW();

  -- Initialize if doesn't exist
  IF NOT FOUND THEN
    SELECT * INTO v_quota
    FROM public.initialize_user_quota(p_user_id);
  END IF;

  -- Check feature-specific quota
  IF p_feature_type = 'flashcard_generation' THEN
    v_used := v_quota.flashcard_generations_used;
    v_limit := v_quota.flashcard_generations_limit;

    -- Check if allowed (null limit = unlimited)
    IF v_limit IS NOT NULL AND v_used >= v_limit THEN
      RETURN jsonb_build_object(
        'allowed', FALSE,
        'used', v_used,
        'limit', v_limit,
        'remaining', 0,
        'message', 'Monthly flashcard generation quota exceeded. Upgrade to Premium for unlimited access.'
      );
    END IF;

    -- Increment usage
    UPDATE public.usage_quotas
    SET flashcard_generations_used = flashcard_generations_used + 1,
        updated_at = NOW()
    WHERE id = v_quota.id;

    v_used := v_used + 1;

  ELSIF p_feature_type = 'note_improvement' THEN
    v_used := v_quota.note_improvements_used;
    v_limit := v_quota.note_improvements_limit;

    -- Check if allowed
    IF v_limit IS NOT NULL AND v_used >= v_limit THEN
      RETURN jsonb_build_object(
        'allowed', FALSE,
        'used', v_used,
        'limit', v_limit,
        'remaining', 0,
        'message', 'Monthly note improvement quota exceeded. Upgrade to Premium for unlimited access.'
      );
    END IF;

    -- Increment usage
    UPDATE public.usage_quotas
    SET note_improvements_used = note_improvements_used + 1,
        updated_at = NOW()
    WHERE id = v_quota.id;

    v_used := v_used + 1;
  ELSE
    -- Invalid feature type
    RETURN jsonb_build_object(
      'allowed', FALSE,
      'message', 'Invalid feature type'
    );
  END IF;

  -- Return success with updated quota info
  RETURN jsonb_build_object(
    'allowed', TRUE,
    'used', v_used,
    'limit', v_limit,
    'remaining', CASE WHEN v_limit IS NULL THEN NULL ELSE v_limit - v_used END
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Reset monthly quotas (for cron job)
CREATE OR REPLACE FUNCTION public.reset_monthly_quotas()
RETURNS void AS $$
BEGIN
  -- Create new quotas for all active users for the new month
  INSERT INTO public.usage_quotas (
    user_id,
    period_start,
    period_end,
    flashcard_generations_limit,
    note_improvements_limit,
    flashcard_generations_used,
    note_improvements_used
  )
  SELECT
    s.user_id,
    date_trunc('month', NOW()),
    date_trunc('month', NOW()) + INTERVAL '1 month',
    CASE WHEN s.subscription_plan = 'premium' THEN NULL ELSE 3 END,
    CASE WHEN s.subscription_plan = 'premium' THEN NULL ELSE 2 END,
    0,
    0
  FROM public.subscriptions s
  WHERE s.subscription_status IN ('active', 'trialing', 'free')
  ON CONFLICT (user_id, period_start) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Get user quota for current period
CREATE OR REPLACE FUNCTION public.get_user_quota(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_quota public.usage_quotas;
BEGIN
  -- Get current period quota
  SELECT * INTO v_quota
  FROM public.usage_quotas
  WHERE user_id = p_user_id
    AND period_start <= NOW()
    AND period_end > NOW();

  -- Initialize if doesn't exist
  IF NOT FOUND THEN
    SELECT * INTO v_quota
    FROM public.initialize_user_quota(p_user_id);
  END IF;

  -- Return quota info as JSON
  RETURN jsonb_build_object(
    'flashcard_generations_used', v_quota.flashcard_generations_used,
    'flashcard_generations_limit', v_quota.flashcard_generations_limit,
    'flashcard_generations_remaining',
      CASE
        WHEN v_quota.flashcard_generations_limit IS NULL THEN NULL
        ELSE v_quota.flashcard_generations_limit - v_quota.flashcard_generations_used
      END,
    'note_improvements_used', v_quota.note_improvements_used,
    'note_improvements_limit', v_quota.note_improvements_limit,
    'note_improvements_remaining',
      CASE
        WHEN v_quota.note_improvements_limit IS NULL THEN NULL
        ELSE v_quota.note_improvements_limit - v_quota.note_improvements_used
      END,
    'period_start', v_quota.period_start,
    'period_end', v_quota.period_end
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to initialize quotas for new users
CREATE OR REPLACE FUNCTION public.handle_new_user_quota()
RETURNS trigger AS $$
BEGIN
  -- Initialize quota when user signs up
  PERFORM public.initialize_user_quota(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach trigger to auth.users table (commented out - will be set up via Supabase dashboard)
-- CREATE TRIGGER on_auth_user_created
--   AFTER INSERT ON auth.users
--   FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_quota();

-- Note: The trigger on auth.users needs to be created via Supabase dashboard
-- because auth schema is protected. Create it manually with:
-- CREATE TRIGGER on_auth_user_created
--   AFTER INSERT ON auth.users
--   FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_quota();
