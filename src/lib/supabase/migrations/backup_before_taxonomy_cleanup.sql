--
-- Snapshot before the taxonomy / status / content-type migrations.
-- Copies the tables those migrations touch into a private `backup` schema.
-- Additive only: nothing in public is changed. Applied 2026-11-11.
--
-- The backup schema is not exposed by the API and anon/authenticated have no
-- access to it. Drop it once the migrations are verified:
--   DROP SCHEMA backup CASCADE;
--
BEGIN;
CREATE SCHEMA IF NOT EXISTS backup;
REVOKE ALL ON SCHEMA backup FROM public, anon, authenticated;
CREATE TABLE backup.notes_20261111      AS TABLE public.notes;
CREATE TABLE backup.tags_20261111       AS TABLE public.tags;
CREATE TABLE backup.categories_20261111 AS TABLE public.categories;
CREATE TABLE backup.flashcards_20261111 AS TABLE public.flashcards;
REVOKE ALL ON ALL TABLES IN SCHEMA backup FROM public, anon, authenticated;
COMMENT ON SCHEMA backup IS 'Snapshots taken before taxonomy/status migrations (2026-11-11). Drop when no longer needed.';
COMMIT;
