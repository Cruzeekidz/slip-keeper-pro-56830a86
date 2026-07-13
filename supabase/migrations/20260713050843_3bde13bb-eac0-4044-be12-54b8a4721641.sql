
ALTER TABLE public.vendor_invoices
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'admin',
  ADD COLUMN IF NOT EXISTS line_raw_text text,
  ADD COLUMN IF NOT EXISTS line_sender_user_id text,
  ADD COLUMN IF NOT EXISTS flowaccount_expense_id text,
  ADD COLUMN IF NOT EXISTS flowaccount_expense_url text;

ALTER TABLE public.staff_expense_claims
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'admin',
  ADD COLUMN IF NOT EXISTS line_raw_text text,
  ADD COLUMN IF NOT EXISTS line_sender_user_id text;
