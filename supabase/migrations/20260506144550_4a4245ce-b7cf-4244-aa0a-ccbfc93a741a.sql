
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS vat_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wht_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wht_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount_input_mode text NOT NULL DEFAULT 'gross';

COMMENT ON COLUMN public.expenses.amount IS 'Gross amount (incl. VAT, before WHT). Net paid = amount - wht_amount.';
COMMENT ON COLUMN public.expenses.vat_amount IS 'VAT portion included in amount';
COMMENT ON COLUMN public.expenses.wht_amount IS 'Withholding tax credited to liability';
COMMENT ON COLUMN public.expenses.amount_input_mode IS 'How user entered: gross | net';
