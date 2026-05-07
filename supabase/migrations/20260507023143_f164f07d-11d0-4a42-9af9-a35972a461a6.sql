ALTER TABLE public.staff_expense_claims
  ADD COLUMN IF NOT EXISTS category_group text,
  ADD COLUMN IF NOT EXISTS project_tag text,
  ADD COLUMN IF NOT EXISTS vat_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wht_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wht_rate numeric NOT NULL DEFAULT 0;