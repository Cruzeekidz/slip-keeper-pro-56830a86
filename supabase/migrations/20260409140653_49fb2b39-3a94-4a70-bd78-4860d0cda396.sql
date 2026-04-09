-- Allow authenticated users to upload payment-slips and expense-claims
CREATE POLICY "Authenticated users can upload payment-slips"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'receipts'
  AND (storage.foldername(name))[1] = 'payment-slips'
  AND (storage.foldername(name))[2] = (auth.uid())::text
);

CREATE POLICY "Authenticated users can view payment-slips"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'receipts'
  AND (storage.foldername(name))[1] = 'payment-slips'
  AND (storage.foldername(name))[2] = (auth.uid())::text
);

CREATE POLICY "Authenticated users can upload expense-claims"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'receipts'
  AND (storage.foldername(name))[1] = 'expense-claims'
  AND (storage.foldername(name))[2] = (auth.uid())::text
);

CREATE POLICY "Authenticated users can view expense-claims"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'receipts'
  AND (storage.foldername(name))[1] = 'expense-claims'
  AND (storage.foldername(name))[2] = (auth.uid())::text
);