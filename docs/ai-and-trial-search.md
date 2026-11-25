# AI model routing and trial search

## Trial search by name (no LLM)

The trial form's source box accepts free text. `detectTrialQuery` (`src/lib/trials/identify.ts`) decides what it is:

| Input | Example | Flow |
|---|---|---|
| PMID, DOI, PMCID, PubMed/journal link, pasted abstract | `29766750`, `10.1056/NEJMoa1800410` | unchanged: **Extract** → `POST /api/trials/extract` |
| NCT number or ClinicalTrials.gov link | `NCT00991029` | **Search** → `POST /api/trials/search` |
| Anything else (≤120 chars) | `CHANCE-2`, `NAVIGATE ESUS` | **Search** → `POST /api/trials/search` |

`/api/trials/search` (signed-in users, no quota charge) runs `searchTrials` server-side:

1. In parallel:
   - PubMed `"<q>"[Title/Abstract] AND (randomized controlled trial[pt] OR clinical trial[pt])`
   - PubMed `"<q>"[Corporate Author] AND (…)`: papers by the "<q> Investigators" group
   - ClinicalTrials.gov v2 `query.term=AREA[Acronym]"<q>"` (plus separator variants, and `AREA[OfficialTitle]` for names of 3+ words)
2. For each registry study whose acronym is exactly the query (up to 5), PubMed `NCTxxxxxxxx[si]`: papers PubMed links to that registration.
3. One ESummary for all PMIDs, then `rankCandidates` (`src/lib/trials/rankCandidates.ts`):
   names the trial (acronym in title, `[si]` link, or investigator group) > RCT > primary results (not a secondary analysis/comment/protocol/review; "Comment in" links count for it) > journal > recency.
4. The top 5 are returned (the UI shows 3) with an `ambiguous` flag and a `notice` when several registered trials share the acronym or nothing names it exactly.

Picking a candidate sends its PMID to the existing extraction flow.

Results are cached in `trial_search_cache` for 7 days (key `name:<lower-cased query>` or `nct:<NCT id>`). Partial results (a source was unreachable) are not cached.

### NCBI etiquette

Every E-utilities request sends `tool` and (if set) `email` and `api_key`. Requests are spaced to stay under 3 req/s, or 10 req/s with a key. 429/5xx responses are retried with exponential backoff (honouring `Retry-After`). The limiter is per server instance; a cold search makes about 5–7 NCBI requests (about 1.5–3 s without a key), and a cached search makes none.

## AI model routing

`src/lib/ai/models.ts` is the only place that names models. Each task maps to a provider and model (and optionally an effort and a fallback):

| Task | Default | Used by |
|---|---|---|
| `trialExtraction` | `claude-haiku-5-5` (effort low) → fallback `claude-opus-5-5` | `/api/trials/extract` |
| `flashcardGeneration` | `claude-opus-5-5` | `/api/flashcards/generate-from-note` |
| `clinicalQuestion` | `claude-opus-5-5` (effort high) | `/api/answer-questions` |
| `noteImprovement` | `claude-opus-5-5` (effort low) | `/api/improve-note` |
| `articlePrimer` | `claude-haiku-5-5` (effort low) → fallback `claude-opus-5-5` | `/api/articles` (Deep Read primer; see `docs/deep-read-plan.md`) |
| `articleFacts` | `claude-opus-5-5` (effort low) | `/api/articles/[id]/guide` (facts + verbatim excerpts) |
| `articleGuide` | `claude-opus-5-5` (effort medium) | `/api/articles/[id]/guide` (map, stats, appraisal, Q&A, quiz) |

Trial extraction goes through the provider abstraction (`src/lib/ai/providers.ts`: Anthropic SDK, or OpenAI Chat Completions via `fetch`). The output is validated with zod against `ExtractedTrialSchema`. If it fails validation or is truncated, the same model is tried once more and then the fallback model runs. A refusal goes straight to the fallback. Claude Haiku 5.5 has no server-side refusal fallback; Opus requests keep `fallbacks: "default"`.

The other tasks use Anthropic-specific request features and stay on Anthropic; only their model id comes from the config.

Every AI call, including retries and fallbacks, is logged as one `api_usage_logs` row. The row records the task, provider, the model that served it, input and output tokens, total tokens, and the estimated USD cost from the price table in `models.ts`.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | yes (existing) | Claude API |
| `NCBI_API_KEY` | no | Raises the NCBI limit from 3 to 10 req/s. Free from an NCBI account. |
| `NCBI_EMAIL` | recommended | Contact email NCBI asks API users to send |
| `NCBI_TOOL` | no | Tool name sent to NCBI (default `wardnotes`) |
| `AI_MODEL_<TASK>` | no | Override a task's model, e.g. `AI_MODEL_TRIAL_EXTRACTION=claude-sonnet-5-5` |
| `AI_PROVIDER_<TASK>` | no | `anthropic` or `openai` (`TRIAL_EXTRACTION` and `ARTICLE_PRIMER` only). Needs `AI_MODEL_<TASK>` too. |
| `UNPAYWALL_EMAIL` | no | Contact email Unpaywall requires, for finding open-access PDFs. Falls back to `NCBI_EMAIL`. |
| `ARTICLE_PRIMER_DAILY_LIMIT` | no | Primers a user can trigger per 24 h that call the model (cache hits don't count). Default 50. |
| `AI_FALLBACK_MODEL_<TASK>` / `AI_FALLBACK_PROVIDER_<TASK>` | no | Override the fallback model |
| `OPENAI_API_KEY` | only if a task uses `openai` | OpenAI API |
| `OPENAI_BASE_URL` | no | Default `https://api.openai.com/v1` |
| `AI_MODEL_PRICES` | no | JSON prices (USD per million tokens) for models missing from the built-in table, e.g. `{"gpt-x":{"input":0.25,"output":2}}`. Unknown models are logged with cost 0. |

`<TASK>` is the task name in upper snake case: `TRIAL_EXTRACTION`, `FLASHCARD_GENERATION`, `CLINICAL_QUESTION`, `NOTE_IMPROVEMENT`, `ARTICLE_PRIMER`, `ARTICLE_FACTS`, `ARTICLE_GUIDE`.

## Migrations

Apply in the Supabase SQL editor. All are additive and safe to apply before or after deploy:

- `src/lib/supabase/migrations/add_ai_usage_details.sql` adds `ai_task`, `provider`, `model`, `input_tokens` and `output_tokens` to `api_usage_logs`. Until it's applied, logging falls back to the old columns.
- `src/lib/supabase/migrations/add_trial_search_cache.sql` creates the `trial_search_cache` table (service role only). Without it, search works but nothing is cached.

- `src/lib/supabase/migrations/add_article_reads.sql` creates the Deep Read tables (`article_reads`, `article_guides`, and the server-only `article_cache`) and adds the `article_primer` / `article_guide` labels to `api_usage_logs`. Until it's applied, the Reading tab can't add articles.
- `src/lib/supabase/migrations/add_article_full_text.sql` adds `article_reads.sections` and the private `article-pdfs` storage bucket (PDF uploads). Needed for Deep Read guides.

Rollbacks: `*_rollback.sql` next to each.

## Integration check

```bash
npm run trials:eval -- --search-only     # name search only: free, no keys
npm run trials:eval -- --out report.md   # + cheap vs current model extraction (needs ANTHROPIC_API_KEY; billed)
```

It runs SPS3, CHANCE-2, POINT, INSPIRES, THALES, NAVIGATE ESUS, ELAN, CSPS.com, ARCADIA and SAMMPRIS. For each it reports whether the primary publication ranked #1, the extracted fields side by side, and the cost per trial. It exits non-zero if any primary publication isn't #1. The last search-only run is in `docs/trial-search-eval.md`.
