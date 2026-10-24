--
-- Note Images Storage Migration
-- Creates a public storage bucket for images pasted or dropped into the note editor.
-- Files are stored under <user_id>/<filename>; users can only write to their own folder.
--

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'note-images',
  'note-images',
  true,
  10485760, -- 10 MB
  ARRAY['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Users can upload their own note images" ON storage.objects;
CREATE POLICY "Users can upload their own note images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'note-images' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users can update their own note images" ON storage.objects;
CREATE POLICY "Users can update their own note images"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'note-images' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users can delete their own note images" ON storage.objects;
CREATE POLICY "Users can delete their own note images"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'note-images' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Anyone can view note images" ON storage.objects;
CREATE POLICY "Anyone can view note images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'note-images');
