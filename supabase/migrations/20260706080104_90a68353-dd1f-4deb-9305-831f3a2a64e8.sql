
ALTER TABLE public.vendor_invoices
  ADD COLUMN IF NOT EXISTS flowaccount_bill_id text,
  ADD COLUMN IF NOT EXISTS flowaccount_bill_url text,
  ADD COLUMN IF NOT EXISTS flowaccount_wht_id text,
  ADD COLUMN IF NOT EXISTS flowaccount_wht_url text,
  ADD COLUMN IF NOT EXISTS flowaccount_push_status text,
  ADD COLUMN IF NOT EXISTS flowaccount_push_error text,
  ADD COLUMN IF NOT EXISTS flowaccount_pushed_at timestamptz;
