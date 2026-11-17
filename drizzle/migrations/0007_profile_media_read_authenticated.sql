DROP POLICY IF EXISTS "profile_media_read" ON storage.objects;
CREATE POLICY "profile_media_read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'profile-media');