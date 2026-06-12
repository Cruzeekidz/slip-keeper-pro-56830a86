-- Move 3 vendor bill files uploaded by old LINE webhook from 'documents' bucket to 'receipts' bucket
UPDATE storage.objects
SET bucket_id = 'receipts'
WHERE bucket_id = 'documents'
  AND name IN (
    'vendor-bills/6173693c-153d-42de-bb6c-388a4798295f/2026/05/line_1779801191523_615673298890260753.jpg',
    'vendor-bills/6173693c-153d-42de-bb6c-388a4798295f/2026/05/line_1778839220353_614059382737207519.pdf',
    'vendor-bills/6173693c-153d-42de-bb6c-388a4798295f/2026/05/line_1778549667210_613573591787372633.jpg'
  );