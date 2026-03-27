CREATE POLICY "Anon can upload vendor bills to receipts"
ON storage.objects FOR INSERT
TO anon
WITH CHECK (
  bucket_id = 'receipts'
  AND (storage.foldername(name))[1] = 'vendor-bills'
);