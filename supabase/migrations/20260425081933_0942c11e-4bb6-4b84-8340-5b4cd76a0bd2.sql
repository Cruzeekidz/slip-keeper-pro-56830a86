-- Allow uploads under entity-prefixed paths: {entity}/{userId}/{year}/{month}/{filename}
-- Entities: personal, transfer, business, bcc-next, kukanang

CREATE POLICY "Users can upload receipts under entity folders"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'receipts'
  AND (storage.foldername(name))[1] IN ('personal','transfer','business','bcc-next','kukanang')
  AND (storage.foldername(name))[2] = (auth.uid())::text
);

CREATE POLICY "Users can view receipts under entity folders"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'receipts'
  AND (storage.foldername(name))[1] IN ('personal','transfer','business','bcc-next','kukanang')
  AND (storage.foldername(name))[2] = (auth.uid())::text
);

CREATE POLICY "Users can update receipts under entity folders"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'receipts'
  AND (storage.foldername(name))[1] IN ('personal','transfer','business','bcc-next','kukanang')
  AND (storage.foldername(name))[2] = (auth.uid())::text
)
WITH CHECK (
  bucket_id = 'receipts'
  AND (storage.foldername(name))[1] IN ('personal','transfer','business','bcc-next','kukanang')
  AND (storage.foldername(name))[2] = (auth.uid())::text
);

CREATE POLICY "Users can delete receipts under entity folders"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'receipts'
  AND (storage.foldername(name))[1] IN ('personal','transfer','business','bcc-next','kukanang')
  AND (storage.foldername(name))[2] = (auth.uid())::text
);