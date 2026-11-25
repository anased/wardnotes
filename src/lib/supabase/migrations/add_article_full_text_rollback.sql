--
-- Rollback for add_article_full_text.sql
--
-- Drops the stored full text and the PDF bucket's policies. Uploaded PDFs are left
-- in storage: empty the article-pdfs bucket in the dashboard (Storage) first if you
-- want the bucket itself removed, then run the commented line.
--

DROP POLICY IF EXISTS "Users can upload their own article PDFs" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own article PDFs" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own article PDFs" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own article PDFs" ON storage.objects;
-- DELETE FROM storage.buckets WHERE id = 'article-pdfs';

ALTER TABLE public.article_reads DROP COLUMN IF EXISTS sections;
