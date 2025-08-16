--
-- WardNotes Database Schema (Synced with Production)
-- PostgreSQL database schema for WardNotes medical education app
--

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

--
-- Custom Types
--

CREATE TYPE public.flashcard_status AS ENUM (
    'new',
    'learning',
    'review',
    'mature',
    'suspended'
);

CREATE TYPE public.flashcard_type AS ENUM (
    'cloze',
    'front_back'
);

--
-- Functions
--

-- SM-2 Algorithm for flashcard scheduling
CREATE OR REPLACE FUNCTION public.calculate_next_review(quality integer, ease_factor numeric, interval_days integer, repetitions integer) 
RETURNS TABLE(new_ease_factor numeric, new_interval integer, new_repetitions integer, next_review_date timestamp with time zone)
LANGUAGE plpgsql
AS $$
DECLARE
  new_ef DECIMAL(3,2);
  new_int INTEGER;
  new_reps INTEGER;
BEGIN
  -- SM-2 Algorithm implementation
  IF quality >= 3 THEN
    -- Correct response
    new_reps := repetitions + 1;
    
    IF new_reps = 1 THEN
      new_int := 1;
    ELSIF new_reps = 2 THEN
      new_int := 6;
    ELSE
      new_int := ROUND(interval_days * ease_factor);
    END IF;
    
    -- Update ease factor
    new_ef := ease_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    new_ef := GREATEST(new_ef, 1.3);
  ELSE
    -- Incorrect response
    new_reps := 0;
    new_int := 1;
    new_ef := ease_factor;
  END IF;
  
  RETURN QUERY SELECT 
    new_ef,
    new_int,
    new_reps,
    (NOW() + INTERVAL '1 day' * new_int)::TIMESTAMP WITH TIME ZONE;
END;
$$;

-- Create default flashcard deck for new users
CREATE OR REPLACE FUNCTION public.create_user_default_deck() 
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  deck_id UUID;
BEGIN
  INSERT INTO flashcard_decks (user_id, name, description, color)
  VALUES (auth.uid(), 'Default Deck', 'Auto-generated default deck for flashcards', '#3B82F6')
  RETURNING id INTO deck_id;
  
  RETURN deck_id;
END;
$$;

-- Get due flashcards for review
CREATE OR REPLACE FUNCTION public.get_due_cards(deck_uuid uuid DEFAULT NULL::uuid) 
RETURNS SETOF public.flashcards
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM flashcards
  WHERE 
    user_id::text = auth.uid()::text AND
    (deck_uuid IS NULL OR deck_id = deck_uuid) AND
    next_review <= NOW() AND
    status != 'suspended'
  ORDER BY next_review ASC;
END;
$$;

-- Handle new user subscription creation
CREATE OR REPLACE FUNCTION public.handle_new_user_subscription() 
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.subscriptions (user_id, subscription_status, subscription_plan)
  VALUES (new.id, 'free', 'free');
  RETURN new;
END;
$$;

-- Check if user has premium access
CREATE OR REPLACE FUNCTION public.is_premium_user(user_uuid uuid) 
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  has_premium BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM subscriptions 
    WHERE user_id = user_uuid 
    AND subscription_status = 'active'
    AND subscription_plan = 'premium'
    AND (valid_until IS NULL OR valid_until > NOW())
  ) INTO has_premium;
  
  RETURN has_premium;
END;
$$;

-- Search notes function
CREATE OR REPLACE FUNCTION public.search_notes(search_query text) 
RETURNS SETOF public.notes
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM notes
  WHERE 
    user_id = auth.uid() AND
    (
      title ILIKE '%' || search_query || '%' OR
      content::TEXT ILIKE '%' || search_query || '%' OR
      search_query = ANY(tags)
    )
  ORDER BY created_at DESC;
END;
$$;

-- Update daily activity tracking
CREATE OR REPLACE FUNCTION public.update_daily_activity() 
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  today DATE := CURRENT_DATE;
  yesterday DATE := CURRENT_DATE - INTERVAL '1 day';
  current_streak INTEGER;
  has_yesterday_activity BOOLEAN;
BEGIN
  -- Check if user has activity for yesterday
  SELECT EXISTS (
    SELECT 1 FROM daily_activity 
    WHERE user_id = NEW.user_id AND date = yesterday
  ) INTO has_yesterday_activity;
  
  -- Get current streak
  SELECT COALESCE(MAX(streak_days), 0) INTO current_streak 
  FROM daily_activity 
  WHERE user_id = NEW.user_id AND date = yesterday;
  
  -- If yesterday has activity, increment streak, otherwise reset to 1
  IF has_yesterday_activity THEN
    current_streak := current_streak + 1;
  ELSE
    current_streak := 1;
  END IF;
  
  -- Insert or update today's activity
  INSERT INTO daily_activity (user_id, date, notes_count, streak_days) 
  VALUES (NEW.user_id, today, 1, current_streak)
  ON CONFLICT (user_id, date) 
  DO UPDATE SET 
    notes_count = daily_activity.notes_count + 1,
    streak_days = current_streak,
    updated_at = NOW();
    
  RETURN NEW;
END;
$$;

--
-- Tables
--

-- User categories (dynamic, user-defined)
CREATE TABLE public.categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    color text DEFAULT 'blue'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT categories_pkey PRIMARY KEY (id),
    CONSTRAINT categories_user_id_name_key UNIQUE (user_id, name),
    CONSTRAINT categories_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

-- Daily activity tracking
CREATE TABLE public.daily_activity (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    date date NOT NULL,
    notes_count integer DEFAULT 0,
    streak_days integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT daily_activity_pkey PRIMARY KEY (id),
    CONSTRAINT daily_activity_user_date_unique UNIQUE (user_id, date),
    CONSTRAINT daily_activity_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

-- Flashcard decks
CREATE TABLE public.flashcard_decks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    color text DEFAULT '#3B82F6'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT flashcard_decks_pkey PRIMARY KEY (id)
);

-- Flashcard generations (AI-generated flashcards from notes)
CREATE TABLE public.flashcard_generations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    note_id uuid NOT NULL,
    user_id uuid NOT NULL,
    cards jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    card_type public.flashcard_type DEFAULT 'cloze'::public.flashcard_type,
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT flashcard_generations_pkey PRIMARY KEY (id),
    CONSTRAINT unique_note_generation UNIQUE (note_id)
);

-- Flashcard reviews (study session results)
CREATE TABLE public.flashcard_reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    flashcard_id uuid NOT NULL,
    user_id uuid NOT NULL,
    reviewed_at timestamp with time zone DEFAULT now(),
    quality integer NOT NULL,
    response_time integer,
    previous_ease_factor numeric(3,2),
    previous_interval integer,
    previous_repetitions integer,
    new_ease_factor numeric(3,2),
    new_interval integer,
    new_repetitions integer,
    CONSTRAINT flashcard_reviews_pkey PRIMARY KEY (id),
    CONSTRAINT flashcard_reviews_quality_check CHECK (((quality >= 0) AND (quality <= 5)))
);

-- Flashcard study sessions
CREATE TABLE public.flashcard_study_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    deck_id uuid,
    started_at timestamp with time zone DEFAULT now(),
    ended_at timestamp with time zone,
    cards_studied integer DEFAULT 0,
    cards_correct integer DEFAULT 0,
    total_time integer DEFAULT 0,
    session_type text DEFAULT 'review'::text,
    CONSTRAINT flashcard_study_sessions_pkey PRIMARY KEY (id)
);

-- Individual flashcards
CREATE TABLE public.flashcards (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    deck_id uuid NOT NULL,
    note_id uuid,
    user_id uuid NOT NULL,
    card_type public.flashcard_type NOT NULL,
    front_content text,
    back_content text,
    cloze_content text,
    status public.flashcard_status DEFAULT 'new'::public.flashcard_status,
    ease_factor numeric(3,2) DEFAULT 2.50,
    interval_days integer DEFAULT 0,
    repetitions integer DEFAULT 0,
    last_reviewed timestamp with time zone,
    next_review timestamp with time zone DEFAULT now(),
    total_reviews integer DEFAULT 0,
    correct_reviews integer DEFAULT 0,
    tags text[] DEFAULT '{}'::text[],
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT flashcards_pkey PRIMARY KEY (id)
);

-- User notes
CREATE TABLE public.notes (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    content jsonb NOT NULL,
    tags text[] DEFAULT '{}'::text[],
    category text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notes_pkey PRIMARY KEY (id),
    CONSTRAINT notes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- User subscriptions
CREATE TABLE public.subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    stripe_customer_id text,
    stripe_subscription_id text,
    subscription_status text DEFAULT 'free'::text NOT NULL,
    subscription_plan text DEFAULT 'free'::text NOT NULL,
    valid_until timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT subscriptions_pkey PRIMARY KEY (id),
    CONSTRAINT subscriptions_user_id_unique UNIQUE (user_id),
    CONSTRAINT subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

-- User tags
CREATE TABLE public.tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT tags_pkey PRIMARY KEY (id),
    CONSTRAINT tags_user_id_name_key UNIQUE (user_id, name),
    CONSTRAINT tags_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

--
-- Indexes
--

CREATE INDEX categories_user_id_idx ON public.categories USING btree (user_id);
CREATE INDEX daily_activity_date_idx ON public.daily_activity USING btree (date);
CREATE INDEX daily_activity_user_id_idx ON public.daily_activity USING btree (user_id);
CREATE INDEX flashcard_decks_user_id_idx ON public.flashcard_decks USING btree (user_id);
CREATE INDEX flashcard_generations_note_id_idx ON public.flashcard_generations USING btree (note_id);
CREATE INDEX flashcard_generations_user_id_idx ON public.flashcard_generations USING btree (user_id);
CREATE INDEX flashcard_reviews_flashcard_id_idx ON public.flashcard_reviews USING btree (flashcard_id);
CREATE INDEX flashcard_reviews_reviewed_at_idx ON public.flashcard_reviews USING btree (reviewed_at);
CREATE INDEX flashcard_reviews_user_id_idx ON public.flashcard_reviews USING btree (user_id);
CREATE INDEX flashcard_study_sessions_deck_id_idx ON public.flashcard_study_sessions USING btree (deck_id);
CREATE INDEX flashcard_study_sessions_user_id_idx ON public.flashcard_study_sessions USING btree (user_id);
CREATE INDEX flashcards_deck_id_idx ON public.flashcards USING btree (deck_id);
CREATE INDEX flashcards_next_review_idx ON public.flashcards USING btree (next_review);
CREATE INDEX flashcards_note_id_idx ON public.flashcards USING btree (note_id);
CREATE INDEX flashcards_status_idx ON public.flashcards USING btree (status);
CREATE INDEX flashcards_user_id_idx ON public.flashcards USING btree (user_id);
CREATE INDEX subscriptions_stripe_customer_id_idx ON public.subscriptions USING btree (stripe_customer_id);
CREATE INDEX subscriptions_user_id_idx ON public.subscriptions USING btree (user_id);
CREATE INDEX tags_user_id_idx ON public.tags USING btree (user_id);

--
-- Foreign Key Constraints
--

ALTER TABLE ONLY public.flashcard_generations
    ADD CONSTRAINT flashcard_generations_note_id_fkey FOREIGN KEY (note_id) REFERENCES public.notes(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.flashcard_reviews
    ADD CONSTRAINT flashcard_reviews_flashcard_id_fkey FOREIGN KEY (flashcard_id) REFERENCES public.flashcards(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.flashcard_study_sessions
    ADD CONSTRAINT flashcard_study_sessions_deck_id_fkey FOREIGN KEY (deck_id) REFERENCES public.flashcard_decks(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.flashcards
    ADD CONSTRAINT flashcards_deck_id_fkey FOREIGN KEY (deck_id) REFERENCES public.flashcard_decks(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.flashcards
    ADD CONSTRAINT flashcards_note_id_fkey FOREIGN KEY (note_id) REFERENCES public.notes(id) ON DELETE CASCADE;

--
-- Triggers
--

CREATE TRIGGER on_note_created AFTER INSERT ON public.notes FOR EACH ROW EXECUTE FUNCTION public.update_daily_activity();

--
-- Row Level Security
--

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flashcard_decks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flashcard_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flashcard_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flashcard_study_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flashcards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

--
-- RLS Policies
--

-- Categories policies
CREATE POLICY "Users can view their own categories" ON public.categories FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own categories" ON public.categories FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own categories" ON public.categories FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own categories" ON public.categories FOR DELETE USING (auth.uid() = user_id);

-- Daily activity policies
CREATE POLICY "Users can view their own activity" ON public.daily_activity FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own activity" ON public.daily_activity FOR UPDATE USING (auth.uid() = user_id);

-- Flashcard deck policies
CREATE POLICY "Users can view their own decks" ON public.flashcard_decks FOR SELECT USING ((auth.uid())::text = (user_id)::text);
CREATE POLICY "Users can create their own decks" ON public.flashcard_decks FOR INSERT WITH CHECK ((auth.uid())::text = (user_id)::text);
CREATE POLICY "Users can update their own decks" ON public.flashcard_decks FOR UPDATE USING ((auth.uid())::text = (user_id)::text);
CREATE POLICY "Users can delete their own decks" ON public.flashcard_decks FOR DELETE USING ((auth.uid())::text = (user_id)::text);

-- Flashcard generation policies
CREATE POLICY "Users can view their own flashcard generations" ON public.flashcard_generations FOR SELECT USING ((auth.uid())::text = (user_id)::text);
CREATE POLICY "Users can create their own flashcard generations" ON public.flashcard_generations FOR INSERT WITH CHECK ((auth.uid())::text = (user_id)::text);
CREATE POLICY "Users can insert their own flashcard generations" ON public.flashcard_generations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own flashcard generations" ON public.flashcard_generations FOR UPDATE USING ((auth.uid())::text = (user_id)::text);
CREATE POLICY "Users can delete their own flashcard generations" ON public.flashcard_generations FOR DELETE USING ((auth.uid())::text = (user_id)::text);

-- Flashcard review policies
CREATE POLICY "Users can view their own reviews" ON public.flashcard_reviews FOR SELECT USING ((auth.uid())::text = (user_id)::text);
CREATE POLICY "Users can create their own reviews" ON public.flashcard_reviews FOR INSERT WITH CHECK ((auth.uid())::text = (user_id)::text);

-- Flashcard study session policies
CREATE POLICY "Users can view their own study sessions" ON public.flashcard_study_sessions FOR SELECT USING ((auth.uid())::text = (user_id)::text);
CREATE POLICY "Users can create their own study sessions" ON public.flashcard_study_sessions FOR INSERT WITH CHECK ((auth.uid())::text = (user_id)::text);
CREATE POLICY "Users can update their own study sessions" ON public.flashcard_study_sessions FOR UPDATE USING ((auth.uid())::text = (user_id)::text);

-- Flashcard policies
CREATE POLICY "Users can view their own flashcards" ON public.flashcards FOR SELECT USING ((auth.uid())::text = (user_id)::text);
CREATE POLICY "Users can create their own flashcards" ON public.flashcards FOR INSERT WITH CHECK ((auth.uid())::text = (user_id)::text);
CREATE POLICY "Users can update their own flashcards" ON public.flashcards FOR UPDATE USING ((auth.uid())::text = (user_id)::text);
CREATE POLICY "Users can delete their own flashcards" ON public.flashcards FOR DELETE USING ((auth.uid())::text = (user_id)::text);

-- Notes policies
CREATE POLICY "Users can select their own notes" ON public.notes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own notes" ON public.notes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own notes" ON public.notes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own notes" ON public.notes FOR DELETE USING (auth.uid() = user_id);

-- Subscription policies
CREATE POLICY "Users can view their own subscription" ON public.subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own subscription" ON public.subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own subscription" ON public.subscriptions FOR UPDATE USING (auth.uid() = user_id);

-- Tag policies
CREATE POLICY "Users can view their own tags" ON public.tags FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own tags" ON public.tags FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own tags" ON public.tags FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own tags" ON public.tags FOR DELETE USING (auth.uid() = user_id);