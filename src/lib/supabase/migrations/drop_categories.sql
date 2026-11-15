--
-- Drop the categories table (2026-11-15)
--
-- Categories were retired: specialties are top-level topics and notes.category
-- is gone (drop_note_category.sql). Nothing references this table any more
-- (no foreign keys, views or functions); its own trigger and RLS policies go
-- with it. normalize_name_column() stays: other tables use it.
--
-- The rows are copied to backup.categories_pre_drop first.
-- Safe to run more than once. Undo with drop_categories_rollback.sql.
--

BEGIN;

CREATE SCHEMA IF NOT EXISTS backup;
REVOKE ALL ON SCHEMA backup FROM public, anon, authenticated;

DO $$
BEGIN
  IF to_regclass('public.categories') IS NOT NULL AND to_regclass('backup.categories_pre_drop') IS NULL THEN
    CREATE TABLE backup.categories_pre_drop AS SELECT * FROM public.categories;
  END IF;
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA backup FROM public, anon, authenticated;

DROP TABLE IF EXISTS public.categories;

COMMIT;
