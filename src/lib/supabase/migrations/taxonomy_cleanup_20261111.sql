--
-- Taxonomy cleanup (2026-11-11)
--
-- Merges duplicate tags/categories and moves tags to sentence case for ONE
-- account, using the mapping reviewed from scripts/audit-taxonomy.sql.
--
-- * Transactional: everything runs in one transaction.
-- * DRY RUN BY DEFAULT: the script ends with ROLLBACK. The final SELECT
--   reports every change it would make. Change ROLLBACK to COMMIT to apply.
-- * Idempotent: mappings are matched on the old name, so a second run finds
--   nothing to change.
-- * Backup: requires the snapshot from backup_before_taxonomy_cleanup.sql.
--   Undo with taxonomy_cleanup_20261111_rollback.sql.
--
-- Out of scope (handled by the status/content-type migration): the
-- content-type tags (Question/Answer, Article, Trials, Review, case) and the
-- "Not answered" status tag.
--

BEGIN;

DO $$
BEGIN
  IF to_regclass('backup.notes_20261111') IS NULL THEN
    RAISE EXCEPTION 'Backup snapshot missing: run backup_before_taxonomy_cleanup.sql first';
  END IF;
END $$;

CREATE TEMP TABLE taxonomy_map (
  user_id   uuid NOT NULL,
  kind      text NOT NULL CHECK (kind IN ('tag', 'category')),
  from_name text NOT NULL,
  to_name   text,            -- NULL = delete
  PRIMARY KEY (user_id, kind, from_name)
) ON COMMIT DROP;

INSERT INTO taxonomy_map (user_id, kind, from_name, to_name)
SELECT '5079b1fe-6b16-444b-9556-927b6879666d'::uuid, m.kind, m.from_name, m.to_name
FROM (VALUES
  -- Categories
  ('category', 'Neurology new',             'Neurology'),
  ('category', 'Something new',             NULL),
  ('category', 'Procedures',                NULL),
  -- Tag merges and deletes
  ('tag',      'Neuromusclar',              'Neuromuscular'),
  ('tag',      'Trial',                     NULL),
  -- Tags to sentence case
  ('tag',      'neuromuscular',             'Neuromuscular'),
  ('tag',      'pediatric',                 'Pediatric'),
  ('tag',      'clinical pearls',           'Clinical pearls'),
  ('tag',      'stroke',                    'Stroke'),
  ('tag',      'neuroanatomy',              'Neuroanatomy'),
  ('tag',      'clinical guidelines',       'Clinical guidelines'),
  ('tag',      'neuro-oncology',            'Neuro-oncology'),
  ('tag',      'arachnoid cyst',            'Arachnoid cyst'),
  ('tag',      'autoimmune encephalitis',   'Autoimmune encephalitis'),
  ('tag',      'myopathies',                'Myopathies'),
  ('tag',      'neuroinfectious',           'Neuroinfectious'),
  ('tag',      'neuroradiology',            'Neuroradiology'),
  ('tag',      'neurosurgery',              'Neurosurgery'),
  ('tag',      'parkinson''s disease',      'Parkinson''s disease'),
  ('tag',      'toxicology',                'Toxicology'),
  ('tag',      'vascular neurology',        'Vascular neurology'),
  ('tag',      'Autonomic Neurology',       'Autonomic neurology'),
  ('tag',      'Motor Neuron Disorders',    'Motor neuron disorders'),
  ('tag',      'Movement Disorders',        'Movement disorders'),
  ('tag',      'Neuroradiology Findings',   'Neuroradiology findings'),
  ('tag',      'Stroke Prevention',         'Stroke prevention'),
  ('tag',      'Pathophysiology/Mechanism', 'Pathophysiology/mechanism')
) AS m(kind, from_name, to_name);

-- Snapshot of affected rows, for the report.
CREATE TEMP TABLE taxonomy_before ON COMMIT DROP AS
SELECT n.id, n.user_id, n.title, n.tags, n.category
FROM public.notes n
WHERE n.user_id IN (SELECT DISTINCT user_id FROM taxonomy_map);

CREATE TEMP TABLE taxonomy_tags_before ON COMMIT DROP AS
SELECT t.* FROM public.tags t
WHERE t.user_id IN (SELECT DISTINCT user_id FROM taxonomy_map);

CREATE TEMP TABLE taxonomy_categories_before ON COMMIT DROP AS
SELECT c.* FROM public.categories c
WHERE c.user_id IN (SELECT DISTINCT user_id FROM taxonomy_map);

CREATE TEMP TABLE taxonomy_flashcards_before ON COMMIT DROP AS
SELECT f.id, f.tags
FROM public.flashcards f
WHERE f.user_id IN (SELECT DISTINCT user_id FROM taxonomy_map);

-- A category can only be deleted if no note still uses it.
DO $$
DECLARE v_bad text;
BEGIN
  SELECT string_agg(DISTINCT n.category, ', ') INTO v_bad
  FROM public.notes n
  JOIN taxonomy_map m
    ON m.user_id = n.user_id AND m.kind = 'category'
   AND m.to_name IS NULL AND m.from_name = n.category;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Categories mapped to delete are still used by notes: %', v_bad;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Tags
-- ---------------------------------------------------------------------------

-- Remove tag rows that are merged into another tag or deleted.
DELETE FROM public.tags t
USING taxonomy_map m
WHERE m.kind = 'tag' AND m.user_id = t.user_id AND m.from_name = t.name
  AND (m.to_name IS NULL OR lower(m.to_name) <> lower(m.from_name));

-- Case-only renames keep the same row.
UPDATE public.tags t
SET name = m.to_name
FROM taxonomy_map m
WHERE m.kind = 'tag' AND m.user_id = t.user_id AND m.from_name = t.name
  AND lower(m.to_name) = lower(m.from_name) AND t.name <> m.to_name;

-- Make sure every merge target that something was merged into has a row.
INSERT INTO public.tags (user_id, name)
SELECT DISTINCT m.user_id, m.to_name
FROM taxonomy_map m
WHERE m.kind = 'tag' AND m.to_name IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM taxonomy_tags_before b
    WHERE b.user_id = m.user_id AND b.name = m.from_name
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.tags t
    WHERE t.user_id = m.user_id AND lower(t.name) = lower(m.to_name)
  );

-- Rewrite tag arrays on notes and flashcards (order kept, deletes dropped,
-- case-insensitive duplicates removed).
UPDATE public.notes n
SET tags = public.dedupe_tags_ci(array(
  SELECT CASE WHEN m.from_name IS NULL THEN u.t ELSE m.to_name END
  FROM unnest(n.tags) WITH ORDINALITY AS u(t, ord)
  LEFT JOIN taxonomy_map m
    ON m.kind = 'tag' AND m.user_id = n.user_id AND m.from_name = u.t
  WHERE m.from_name IS NULL OR m.to_name IS NOT NULL
  ORDER BY u.ord
))
WHERE n.user_id IN (SELECT user_id FROM taxonomy_map WHERE kind = 'tag')
  AND n.tags && (SELECT array_agg(from_name) FROM taxonomy_map m2
                 WHERE m2.kind = 'tag' AND m2.user_id = n.user_id);

UPDATE public.flashcards f
SET tags = public.dedupe_tags_ci(array(
  SELECT CASE WHEN m.from_name IS NULL THEN u.t ELSE m.to_name END
  FROM unnest(f.tags) WITH ORDINALITY AS u(t, ord)
  LEFT JOIN taxonomy_map m
    ON m.kind = 'tag' AND m.user_id = f.user_id AND m.from_name = u.t
  WHERE m.from_name IS NULL OR m.to_name IS NOT NULL
  ORDER BY u.ord
))
WHERE f.user_id IN (SELECT user_id FROM taxonomy_map WHERE kind = 'tag')
  AND f.tags && (SELECT array_agg(from_name) FROM taxonomy_map m2
                 WHERE m2.kind = 'tag' AND m2.user_id = f.user_id);

-- ---------------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------------

UPDATE public.notes n
SET category = m.to_name
FROM taxonomy_map m
WHERE m.kind = 'category' AND m.user_id = n.user_id
  AND m.from_name = n.category AND m.to_name IS NOT NULL;

DELETE FROM public.categories c
USING taxonomy_map m
WHERE m.kind = 'category' AND m.user_id = c.user_id AND m.from_name = c.name
  AND (m.to_name IS NULL OR lower(m.to_name) <> lower(m.from_name));

UPDATE public.categories c
SET name = m.to_name
FROM taxonomy_map m
WHERE m.kind = 'category' AND m.user_id = c.user_id AND m.from_name = c.name
  AND lower(m.to_name) = lower(m.from_name) AND c.name <> m.to_name;

-- ---------------------------------------------------------------------------
-- Report: one row per change
-- ---------------------------------------------------------------------------

SELECT * FROM (
  SELECT 1 AS ord, 'summary' AS section, 'notes changed' AS item,
         count(*)::text AS before, NULL::text AS after
  FROM taxonomy_before b JOIN public.notes n USING (id)
  WHERE n.tags IS DISTINCT FROM b.tags OR n.category IS DISTINCT FROM b.category
  UNION ALL
  SELECT 1, 'summary', 'flashcards changed', count(*)::text, NULL
  FROM taxonomy_flashcards_before b JOIN public.flashcards f USING (id)
  WHERE f.tags IS DISTINCT FROM b.tags
  UNION ALL
  SELECT 2, 'tags table', 'removed', t.name, NULL
  FROM taxonomy_tags_before t
  WHERE NOT EXISTS (SELECT 1 FROM public.tags x WHERE x.id = t.id)
  UNION ALL
  SELECT 2, 'tags table', 'renamed', t.name, x.name
  FROM taxonomy_tags_before t JOIN public.tags x USING (id)
  WHERE t.name <> x.name
  UNION ALL
  SELECT 2, 'tags table', 'added', NULL, x.name
  FROM public.tags x
  WHERE x.user_id IN (SELECT user_id FROM taxonomy_map)
    AND NOT EXISTS (SELECT 1 FROM taxonomy_tags_before t WHERE t.id = x.id)
  UNION ALL
  SELECT 3, 'categories table', 'removed', c.name, NULL
  FROM taxonomy_categories_before c
  WHERE NOT EXISTS (SELECT 1 FROM public.categories x WHERE x.id = c.id)
  UNION ALL
  SELECT 4, 'note', left(b.title, 60),
         b.category || ' | ' || array_to_string(b.tags, ', '),
         n.category || ' | ' || array_to_string(n.tags, ', ')
  FROM taxonomy_before b JOIN public.notes n USING (id)
  WHERE n.tags IS DISTINCT FROM b.tags OR n.category IS DISTINCT FROM b.category
) r
ORDER BY ord, item, before;

ROLLBACK;  -- dry run. Change to COMMIT to apply.
