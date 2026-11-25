--
-- Deep Read, phase 1 (2026-11-25): see docs/deep-read-plan.md
--
--   article_reads   one row per user per article: metadata, primer, reading status
--   article_guides  guides built for an article (filled from phase 2 on)
--   article_cache   per-PMID cache shared across users (server only): PubMed
--                   metadata, the primer, and open-access full text. Never holds
--                   anything a user uploaded or anything personal.
--
-- * Additive only. Safe to run more than once. Undo with add_article_reads_rollback.sql.
-- * Requires add_topics.sql (set_updated_at(), notes_id_user_id_key,
--   trials_id_user_id_key) and Postgres 15+ (ON DELETE SET NULL (column)).
-- * Also adds the article_primer / article_guide labels to api_usage_logs.
--

BEGIN;

CREATE TABLE IF NOT EXISTS public.article_reads (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  pmid              text,
  doi               text,
  pmcid             text,
  title             text NOT NULL,
  journal           text,
  year              integer,
  abstract          text,
  publication_types text[] NOT NULL DEFAULT '{}',
  study_kind        text NOT NULL DEFAULT 'other',
  full_text_source  text NOT NULL DEFAULT 'none',
  pdf_path          text,
  status            text NOT NULL DEFAULT 'to_read',
  primer            jsonb,
  progress          jsonb,
  note_id           uuid,
  trial_id          uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT article_reads_title_check CHECK (btrim(title) <> ''),
  CONSTRAINT article_reads_year_check CHECK (year IS NULL OR year BETWEEN 1800 AND 2100),
  CONSTRAINT article_reads_study_kind_check CHECK (
    study_kind IN ('rct', 'trial', 'meta_analysis', 'cohort', 'review', 'guideline', 'case', 'other')),
  CONSTRAINT article_reads_full_text_source_check CHECK (
    full_text_source IN ('none', 'pmc', 'unpaywall', 'pdf')),
  CONSTRAINT article_reads_status_check CHECK (status IN ('to_read', 'reading', 'done', 'skipped')),
  CONSTRAINT article_reads_id_user_id_key UNIQUE (id, user_id),
  -- Links only to the same user's note / trial; deleting those just clears the link.
  CONSTRAINT article_reads_note_fkey FOREIGN KEY (note_id, user_id)
    REFERENCES public.notes (id, user_id) ON DELETE SET NULL (note_id),
  CONSTRAINT article_reads_trial_fkey FOREIGN KEY (trial_id, user_id)
    REFERENCES public.trials (id, user_id) ON DELETE SET NULL (trial_id)
);

-- Adding the same article again reopens the existing row. (NULL PMIDs, e.g. a
-- PDF with no PubMed record, never conflict.)
CREATE UNIQUE INDEX IF NOT EXISTS article_reads_user_pmid_key ON public.article_reads (user_id, pmid);
CREATE INDEX IF NOT EXISTS article_reads_user_status_idx
  ON public.article_reads (user_id, status, created_at DESC);

DROP TRIGGER IF EXISTS article_reads_set_updated_at ON public.article_reads;
CREATE TRIGGER article_reads_set_updated_at BEFORE UPDATE ON public.article_reads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.article_guides (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_read_id  uuid NOT NULL,
  user_id          uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  budget_minutes   integer NOT NULL,
  sections         jsonb NOT NULL DEFAULT '[]',
  facts            jsonb NOT NULL DEFAULT '[]',
  guide            jsonb NOT NULL DEFAULT '{}',
  model            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT article_guides_budget_check CHECK (budget_minutes IN (10, 20, 45)),
  CONSTRAINT article_guides_read_fkey FOREIGN KEY (article_read_id, user_id)
    REFERENCES public.article_reads (id, user_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS article_guides_read_idx ON public.article_guides (article_read_id, created_at DESC);

-- Own rows only, as everywhere else in the schema.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['article_reads', 'article_guides']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);

    EXECUTE format('DROP POLICY IF EXISTS "Users can view their own %1$s" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Users can create their own %1$s" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Users can update their own %1$s" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Users can delete their own %1$s" ON public.%1$I', t);

    EXECUTE format('CREATE POLICY "Users can view their own %1$s" ON public.%1$I
                      FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id)', t);
    EXECUTE format('CREATE POLICY "Users can create their own %1$s" ON public.%1$I
                      FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id)', t);
    EXECUTE format('CREATE POLICY "Users can update their own %1$s" ON public.%1$I
                      FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id)
                      WITH CHECK ((SELECT auth.uid()) = user_id)', t);
    EXECUTE format('CREATE POLICY "Users can delete their own %1$s" ON public.%1$I
                      FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id)', t);
  END LOOP;
END $$;

-- Shared cache, keyed by PMID. RLS on with no policies: only the service role
-- (server API routes) can read or write it.
CREATE TABLE IF NOT EXISTS public.article_cache (
  pmid                 text PRIMARY KEY,
  metadata             jsonb NOT NULL,
  primer               jsonb,
  primer_version       text,
  full_text            jsonb,
  full_text_source     text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  expires_at           timestamptz NOT NULL,
  CONSTRAINT article_cache_full_text_source_check CHECK (
    full_text_source IS NULL OR full_text_source IN ('pmc', 'unpaywall'))
);
CREATE INDEX IF NOT EXISTS article_cache_expires_idx ON public.article_cache (expires_at);
ALTER TABLE public.article_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.article_cache FROM anon, authenticated;

-- Usage log labels for the new AI calls.
ALTER TABLE public.api_usage_logs DROP CONSTRAINT IF EXISTS valid_feature_type;
ALTER TABLE public.api_usage_logs ADD CONSTRAINT valid_feature_type CHECK (
  feature_type IN ('flashcard_generation', 'note_improvement', 'answer_questions', 'trial_extraction',
                   'article_primer', 'article_guide')
);

COMMIT;
