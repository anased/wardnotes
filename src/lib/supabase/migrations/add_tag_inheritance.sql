-- Migration: Inherit tags from notes to existing flashcards
-- Run once to backfill tags for flashcards created before tag inheritance feature
-- This migration is idempotent and can be run multiple times safely

-- Update flashcards that have a note_id and currently have no tags
-- Only updates flashcards with empty tags to preserve any user customizations
UPDATE public.flashcards f
SET
  tags = n.tags,
  updated_at = NOW()
FROM public.notes n
WHERE
  f.note_id = n.id
  AND f.tags = '{}';  -- Only update flashcards with empty tags array

-- Query to verify the migration results (optional, for information only)
-- SELECT
--   COUNT(*) as total_updated_flashcards
-- FROM public.flashcards f
-- INNER JOIN public.notes n ON f.note_id = n.id
-- WHERE f.tags = n.tags AND array_length(f.tags, 1) > 0;
