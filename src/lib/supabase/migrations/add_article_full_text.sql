--
-- Deep Read, phase 2 (2026-11-25): full text and PDF uploads. See docs/deep-read-plan.md.
--
--   article_reads.sections  the article's full text split into sections
--                           ({id, heading, text}[]), from PMC, Unpaywall or the
--                           user's own PDF. Per user; never shared.
--   article-pdfs bucket     private; each user reads and writes only their own
--                           folder (<user_id>/<article_read_id>.pdf). 25 MB, PDF only.
--
-- Additive and safe to run more than once. Undo with add_article_full_text_rollback.sql.
-- Requires add_article_reads.sql.
--

ALTER TABLE public.article_reads ADD COLUMN IF NOT EXISTS sections jsonb;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('article-pdfs', 'article-pdfs', false, 26214400, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 26214400, allowed_mime_types = ARRAY['application/pdf'];

DROP POLICY IF EXISTS "Users can upload their own article PDFs" ON storage.objects;
CREATE POLICY "Users can upload their own article PDFs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'article-pdfs' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

DROP POLICY IF EXISTS "Users can update their own article PDFs" ON storage.objects;
CREATE POLICY "Users can update their own article PDFs"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'article-pdfs' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

DROP POLICY IF EXISTS "Users can delete their own article PDFs" ON storage.objects;
CREATE POLICY "Users can delete their own article PDFs"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'article-pdfs' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

DROP POLICY IF EXISTS "Users can view their own article PDFs" ON storage.objects;
CREATE POLICY "Users can view their own article PDFs"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'article-pdfs' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
