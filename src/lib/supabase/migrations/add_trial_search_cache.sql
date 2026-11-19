--
-- Cache for "search trial by name" (PubMed + ClinicalTrials.gov results)
--
-- Key: normalized query (e.g. "name:chance-2", "nct:NCT04078737").
-- Value: ranked candidates JSON. Entries expire after 7 days (expires_at);
-- expired rows are ignored on read and overwritten on the next search.
-- Only the service role (server API route) reads or writes it.
--

CREATE TABLE IF NOT EXISTS public.trial_search_cache (
  query_key TEXT PRIMARY KEY,
  candidates JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_trial_search_cache_expires
  ON public.trial_search_cache(expires_at);

-- RLS on with no policies: anon/authenticated clients get nothing; the service
-- role bypasses RLS.
ALTER TABLE public.trial_search_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.trial_search_cache FROM anon, authenticated;
