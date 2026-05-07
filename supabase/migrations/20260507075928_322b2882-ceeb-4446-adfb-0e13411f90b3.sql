-- Step 1: dedupe orphans by transaction_id (keep latest)
DELETE FROM public.expenses e
WHERE e.user_id IS NULL
  AND e.transaction_id IS NOT NULL
  AND e.id NOT IN (
    SELECT DISTINCT ON (transaction_id) id
    FROM public.expenses
    WHERE user_id IS NULL AND transaction_id IS NOT NULL
    ORDER BY transaction_id, created_at DESC
  );

-- Step 2: drop orphans whose txn_id already exists for super_admin
DELETE FROM public.expenses e
WHERE e.user_id IS NULL
  AND e.transaction_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.expenses e2
    WHERE e2.user_id = '6173693c-153d-42de-bb6c-388a4798295f'
      AND e2.transaction_id = e.transaction_id
  );

-- Step 3: assign remaining orphans to super_admin
UPDATE public.expenses
SET user_id = '6173693c-153d-42de-bb6c-388a4798295f'
WHERE user_id IS NULL;