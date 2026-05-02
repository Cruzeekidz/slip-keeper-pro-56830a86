ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS is_cash boolean NOT NULL DEFAULT false;
ALTER TABLE public.deleted_expenses ADD COLUMN IF NOT EXISTS is_cash boolean DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_expenses_is_cash ON public.expenses(is_cash) WHERE is_cash = true;