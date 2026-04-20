-- 1. Date validation trigger for expenses
CREATE OR REPLACE FUNCTION public.validate_expense_date()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  yr int;
  current_yr int := EXTRACT(YEAR FROM CURRENT_DATE)::int;
BEGIN
  IF NEW.expense_date IS NULL THEN
    RAISE EXCEPTION 'expense_date cannot be null';
  END IF;

  yr := EXTRACT(YEAR FROM NEW.expense_date)::int;

  -- Auto-fix Buddhist Era (พ.ศ.) → Christian Era (ค.ศ.)
  IF yr BETWEEN 2540 AND 2580 THEN
    NEW.expense_date := (NEW.expense_date - INTERVAL '543 years')::date;
    NEW.needs_review := true;
    RETURN NEW;
  END IF;

  -- Reject impossible years
  IF yr < 2015 OR yr > current_yr + 1 THEN
    RAISE EXCEPTION 'Invalid expense_date year: %. Must be between 2015 and %', yr, current_yr + 1;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_expense_date ON public.expenses;
CREATE TRIGGER trg_validate_expense_date
  BEFORE INSERT OR UPDATE OF expense_date ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.validate_expense_date();

-- 2. Index for matched_expense_id lookups (reverse-match)
CREATE INDEX IF NOT EXISTS idx_vendor_invoices_matched_expense
  ON public.vendor_invoices(matched_expense_id) WHERE matched_expense_id IS NOT NULL;