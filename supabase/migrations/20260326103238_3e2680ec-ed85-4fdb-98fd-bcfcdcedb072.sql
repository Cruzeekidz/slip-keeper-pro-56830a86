ALTER TABLE public.staff_invoices
  ADD COLUMN IF NOT EXISTS payment_slip_url text,
  ADD COLUMN IF NOT EXISTS matched_expense_id uuid;

ALTER TABLE public.vendor_invoices
  ADD COLUMN IF NOT EXISTS payment_slip_url text,
  ADD COLUMN IF NOT EXISTS matched_expense_id uuid;