-- Add fields to track non-duplicate confirmations and time from receipts
ALTER TABLE public.expenses 
ADD COLUMN IF NOT EXISTS expense_time time,
ADD COLUMN IF NOT EXISTS non_duplicate_pairs text[] DEFAULT '{}';

-- Create index for faster duplicate checks
CREATE INDEX IF NOT EXISTS idx_expenses_non_duplicate_pairs ON public.expenses USING GIN (non_duplicate_pairs);