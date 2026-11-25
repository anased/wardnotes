# Deep Read: implementation plan

Source: the "WardNotes Deep Read workflow" whiteboard.

**What it does:** a user adds an article (PMID, DOI, link or PDF). They get a free primer in about 10 seconds. On request they get a guide to the parts worth reading, sized to the time they have. Everything they learn can be saved into WardNotes as a note, flashcards or a trial record.

```
0 · Intake (no AI)  →  1 · Primer (automatic, ~10 s)  →  2 · Guide (on request)  →  3 · Read & save
```

Wherever possible this reuses code that already exists. Those places are marked **[reuse]**. Trust safeguards are marked **[trust]**.

---

## 1. User flow

1. **Add an article.** The user pastes a PMID, DOI, PMCID or link into "Add article", or uploads a PDF. A share sheet comes in phase 4.
2. **Primer.** This appears automatically. It gives the question the paper asks, its bottom line, and a verdict (read, skim or skip) with an estimate in minutes. If only the abstract was available, it shows an *Abstract only* badge and an **Upload PDF** button. The article lands in the user's **To read** inbox.
3. **Guide.** The user taps *Build guide* and picks 10, 20 or 45 minutes. This needs the full text. The guide holds:
   - a **reading map**: which sections to read, in what order, and what to look for in each
   - a **stats decoder**: the key numbers, in plain words
   - an **appraisal**: strengths, weaknesses and risk of bias
   - **Q&A**
4. **Read & save.** The guided reader goes step by step and keeps the user's place across sittings. It ends with *Check yourself*, five questions. From the save panel the user can:
   - save a **summary note** to their topics
   - make **flashcards**
   - for trials, create a **trial record** (PICO plus result)

## 2. Data model

New migration: `src/lib/supabase/migrations/add_article_reads.sql`, with a rollback next to it, following the existing convention.

### `article_reads`: one row per user per article

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `user_id` | uuid | `DEFAULT auth.uid()`, cascade on delete |
| `pmid`, `doi`, `pmcid` | text | whichever are known |
| `title`, `journal`, `year`, `abstract` | | from PubMed |
| `publication_types` | text[] | from PubMed `PublicationType` |
| `study_kind` | text | `rct` / `trial` (non-randomised) / `meta_analysis` / `cohort` / `review` / `guideline` / `case` / `other` |
| `full_text_source` | text | `none` / `pmc` / `unpaywall` / `pdf` |
| `pdf_path` | text | `storage://article-pdfs/<user>/<id>.pdf` |
| `status` | text | `to_read` / `reading` / `done` / `skipped` |
| `primer` | jsonb | `{question, bottomLine, verdict, minutes, model}` |
| `progress` | jsonb | `{guideId, step, quizAnswers}` |
| `note_id`, `trial_id` | uuid | set once saved, so saving can't create duplicates |
| `created_at`, `updated_at` | timestamptz | |

Unique on `(user_id, pmid)`, so adding the same article twice reopens the existing row. Every DOI, PMC ID and link is resolved to its PMID first, so a separate DOI constraint isn't needed in phase 1; PDFs with no PMID (phase 2) never conflict.

### `article_guides`: one row per guide built

`id`, `article_read_id`, `user_id`, `budget_minutes` (10/20/45), `sections` jsonb (`[{id, heading, text}]` with stable IDs), `facts` jsonb (`[{id, claim, sectionId, excerpt}]`), `guide` jsonb (`{map, stats, appraisal, qa, quiz}`), `model`, `created_at`.

### Storage and access

- Storage: a new private bucket, `article-pdfs`. Copy the policies from `add_note_images_bucket.sql`, with a per-user folder and signed URLs.
- RLS on both tables: owner only. **[trust]** Guides and uploaded PDFs stay private to the user.

### Types

- Add the row types to `src/lib/supabase/types.ts`.
- Extend `UsageLogFeature` with `'article_primer' | 'article_guide'`.

## 3. Server

### Intake (no AI)

| piece | where | notes |
|---|---|---|
| Parse the identifier | `src/lib/trials/identify.ts` **[reuse]** | `parseTrialIdentifier` already handles PMID, DOI, PMCID and URLs. Move the shared parts to `src/lib/articles/` later if the name starts to mislead. |
| Fetch the abstract | `src/lib/trials/pubmed.ts` **[reuse]** | Extend `PubmedArticle` and `parsePubmedXml` with `publicationTypes` and `pmcid`, and keep the trial tests green. |
| Classify | new `src/lib/articles/classify.ts` | Pure mapping from PublicationType to `study_kind`. Unit tested. |
| Full text | new `src/lib/articles/fullText.ts` | Try PMC OA XML (efetch `db=pmc`, through `ncbi.ts` **[reuse]** for rate limiting), then Unpaywall (needs `UNPAYWALL_EMAIL`; fall back to `NCBI_EMAIL`), then ask for a PDF upload. |
| PDF text | same file | Extract text from the uploaded PDF server-side. A scanned PDF with no text layer (or too little text to split into sections) is rejected with a 422 and the message below; the upload is deleted and nothing is charged. |
| Sections | new `src/lib/articles/sections.ts` | Split into sections using JATS `<sec>` tags (PMC) or heading heuristics (PDF and Unpaywall). The IDs are stable (`s1`, `s1.2`, …), so the guide, progress and excerpts can refer to them. |

Scanned-PDF message, shown on the article page under the Upload PDF button:

> This PDF looks like a scan, so its text can't be read. Try downloading the PDF from the publisher or PubMed Central instead. You can still use the primer, which is based on the abstract.

### Shared cache

New migration `add_article_cache.sql` creates `article_cache`, a table only the server can read or write. It has no client access, the same setup as `trial_search_cache` **[reuse]**. It is keyed by PMID and holds what is the same for everyone:

| column | holds |
|---|---|
| `pmid` (pk) | |
| `metadata` | title, journal, year, DOI, PMCID, publication types, abstract |
| `primer` | the primer and the model that made it |
| `full_text` | sections from PubMed Central or Unpaywall only, plus `full_text_source` |
| `created_at`, `expires_at` | metadata and full text last 30 days; the primer lasts until the `articlePrimer` prompt or model version changes |

Intake reads the cache before calling PubMed or the model, and copies the result into the user's `article_reads` row. **[trust]** Uploaded PDFs, their text, guides and progress are never written to the cache: they stay per user. If the migration isn't applied yet, intake still works with nothing cached.

### Endpoints

All of them follow the auth, quota and refund pattern in `src/app/api/trials/extract/route.ts` **[reuse]**:

1. Authenticate.
2. Validate and fetch the source before charging.
3. Call `checkAndIncrementQuota`.
4. Call `logAiCalls`, and `refundQuota` on failure.

| route | does |
|---|---|
| `POST /api/articles` | Intake. Parses the input, fetches the metadata, classifies the article and upserts `article_reads`. Then it runs the primer inline and returns the row. |
| `POST /api/articles/[id]/pdf` | Called after the client uploads to storage. Extracts the text, sets `full_text_source='pdf'` and returns the sections. |
| `POST /api/articles/[id]/guide` `{budget}` | Builds a guide. Needs full text. `maxDuration` 300 (two model calls). |
| `PATCH /api/articles/[id]` | Changes status or progress. No AI, so it can be a direct Supabase call from the client. |
| `POST /api/articles/[id]/save-note` | Creates the summary note. See the Save section. |

### AI tasks

Add these to `src/lib/ai/models.ts`, which stays the only file that names a model:

| task | default | why |
|---|---|---|
| `articlePrimer` | `claude-haiku-5-5` (effort low), with `claude-opus-5-5` as fallback | Reads one abstract, the same shape as `trialExtraction`. Add it to `PROVIDER_SWITCHABLE` and route it through `providers.ts` **[reuse]**. |
| `articleFacts` | `claude-opus-5-5` | Extracts facts plus verbatim excerpts from the full text. |
| `articleGuide` | `claude-opus-5-5` | Generates the map, stats decoder, appraisal, Q&A and quiz from the facts only, not the raw text. |

Each output is validated with zod. On a validation failure: retry once, then use the fallback. This is the same loop as `extractTrial.ts` **[reuse]**.

### [trust] Grounding checks

New file `src/lib/articles/grounding.ts`. It is deterministic, does no AI and is unit tested.

- **Every number must appear in the source.** Normalise the numbers in the output (decimals, %, CI ranges, `p<0.05`) and require each one to occur in the abstract (primer) or in the cited section (guide). If one fails, retry once. If it still fails, drop the sentence that holds it and log it.
- **Every excerpt must be a verbatim substring of its `sectionId`.** Excerpts that don't match are removed. The reader shows each excerpt with a link to its section.
- When the primer comes from the abstract alone, it says so (the *Abstract only* badge).

### Quota

- **Primer.** Free. It isn't charged to the user's quota but is logged as `article_primer`. It is cached per PMID across users (see Shared cache), so most primers cost nothing. Add a light per-user daily rate limit to stop abuse.
- **Guide.** Charged to the existing `note_improvement` (AI-assist) quota and logged as `article_guide`. This needs no change to `usage_quotas`. A separate quota can come later if usage shows it's needed.

## 4. Client

| piece | where |
|---|---|
| **Reading tab** | A new top-level tab, alongside Notes, Topics, Trials and Flashcards, in both `src/components/layout/AppSidebar.tsx` and `src/components/layout/MobileNav.tsx`. It shows a badge with the number of articles still to read. |
| **To read** inbox | `src/app/reading/page.tsx`, the Reading tab's home. Filters: To read, Reading, Done, Skipped. Each row shows the verdict and minutes. "Add article" box at the top, with the same input style as the trial source box. |
| Article page | `src/app/reading/[id]/page.tsx`: primer card, *Abstract only* badge with **Upload PDF**, *Build guide* with a 10/20/45 picker, and quota shown through `useQuota` **[reuse]**. |
| Guided reader | `src/components/articles/GuidedReader.tsx`: one step per map entry, showing the excerpt, what to look for, and a link to the section text. Saves `progress` on every step, so the user can pick up where they left off. |
| Check yourself | `src/components/articles/CheckYourself.tsx`: five questions from `guide.quiz`, with answers revealed and each linked back to its fact. |
| Save panel | `src/components/articles/SavePanel.tsx`: the three actions below. |
| Hook | `src/lib/hooks/useArticleReads.ts`, modelled on `useTrials.ts`. |

### Save

Saving reuses the existing flows:

- **Summary note → topics.** Creates a `notes` row with `content_type='article'` (that value already exists). The body is the primer, key stats, appraisal and source link. Topics are attached through `note_topics` / `NoteTopicPicker` **[reuse]**. Store `note_id` on the read.
- **Flashcards.** Generate cards from `guide.facts`, then send them through the existing preview → `/api/flashcards/save-preview` → `save-from-preview` flow **[reuse]**, with `note_id` set to the summary note. If no summary note exists yet, it is created first.
- **Trial record.** Only for `study_kind='rct'`. Open `TrialFormModal` prefilled from `extractTrialFromAbstract` (the same output `/api/trials/extract` gives) **[reuse]**. Store `trial_id`.

## 5. Build order

Each phase ships on its own.

### Phase 1: intake, primer and inbox (PMID / DOI / PMC) — built

Migration to apply: `src/lib/supabase/migrations/add_article_reads.sql` (rollback next to it). Until it's applied, the Reading tab shows no badge and adding an article returns a "not set up yet" message.


- Migrations (both tables, `article_cache`; bucket deferred), types, `classify.ts`, the `pubmed.ts` extensions
- `POST /api/articles` with the primer, the `articlePrimer` task, number grounding for the primer
- The Reading tab (sidebar and mobile nav), the `/reading` inbox and the article page showing the primer and the *Abstract only* badge (Upload button stubbed)
- **Done when:** pasting a PMID gives a primer in about 10 s or less. Every number in it appears in the abstract, the inbox lists the article, re-adding it reopens the same row, and a second user adding the same PMID gets the cached primer with no model call.

### Phase 2: PDF upload, 20-minute guide and saving — built

Migration to apply: `src/lib/supabase/migrations/add_article_full_text.sql` (adds `article_reads.sections` and the private `article-pdfs` bucket; rollback next to it). Optional env var: `UNPAYWALL_EMAIL` (falls back to `NCBI_EMAIL`; without either, only PubMed Central is searched).

As built:
- Full text is looked for automatically when an article page opens (PMC, then Unpaywall; cached per PMID). Otherwise the user uploads a PDF (25 MB max) straight to storage, and `POST /api/articles/[id]/pdf` reads it. Per-user full text lives in `article_reads.sections`, not a separate table.
- Wrong options in quiz questions may contain numbers that aren't in the article (they're meant to be wrong); the question, correct option and explanation are checked.
- Flashcards are made from the guide's Q&A and quiz (no extra AI call) and saved with the existing `save-preview` route.
- The trial record opens the existing trial form with the PMID prefilled (new `defaultSource` prop); extracting there uses the trial form's usual AI-assist charge.
- The UI offers only the 20-minute guide; the API already accepts 10 and 45 for phase 3.


- The `article-pdfs` bucket, PMC and Unpaywall full text (cached), PDF text extraction with the scanned-PDF error, `sections.ts`
- `articleFacts` and `articleGuide`, the guide endpoint, excerpt grounding, quota charge and refund
- Guided reader (single sitting), Check yourself, the save panel (note, flashcards, trial)
- **Done when:** a PMC article and an uploaded PDF each produce a 20-minute guide whose excerpts are all verbatim. All three save actions work, and a second save doesn't create duplicates.

### Phase 3: 10- and 45-minute budgets, resume across sittings

- Budget-aware prompts (how many steps and how deep), persisted `progress`, a "Continue reading" entry in the inbox and dashboard
- **Done when:** the three budgets give guides of clearly different depth, and closing the app mid-guide brings the user back to the same step.

### Phase 4: share sheet, chapters, group sharing

- Share target: the web manifest's `share_target`, plus the native share extension for the Expo app (`app.json`)
- Chapter-level guides for long documents (reviews, guidelines)
- Group sharing of primers and notes. **[trust]** Uploaded PDFs and full text are never shared, only derived notes. This needs its own design pass for RLS.

## 6. Testing

- **Unit tests (jest):** `classify`, `sections` (JATS fixture and PDF-text fixture), `grounding` (number formats, CI ranges, excerpt matching), and the zod schemas. Extend `pubmed.test.ts` for publication types and PMCID.
- **Route tests:** auth, a bad identifier, quota exceeded, refund on model failure. Mirror the trial extract tests.
- **Eval script:** `npm run articles:eval`, modelled on `trials:eval`. It runs on about 20 fixed PMIDs across study kinds and reports grounding failures, latency and cost per primer and guide.
- **e2e:** add a PMID, see the primer, build a guide, save a note.

## 7. Decisions

1. **Guide quota.** The guide is charged to the existing AI-assist (`note_improvement`) quota and logged as `article_guide`. The primer is free and rate-limited.
2. **Scanned PDFs.** Rejected with a clear message (see Intake). No document-input fallback for now.
3. **Shared cache.** Yes, for open-access metadata, primers and full text, keyed by PMID. Uploads and guides stay per user.
4. **Navigation.** Deep Read gets its own top-level **Reading** tab.
