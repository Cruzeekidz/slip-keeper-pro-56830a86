-- =====================================================
-- Cash Advances (เงินทดรองจ่าย)
-- =====================================================
CREATE TABLE public.cash_advances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Recipient
  recipient_type TEXT NOT NULL DEFAULT 'staff' CHECK (recipient_type IN ('staff', 'vendor', 'other')),
  recipient_id UUID, -- FK soft to staff_profiles or vendor_profiles
  recipient_name TEXT NOT NULL,
  recipient_line_user_id TEXT,

  -- Advance info
  advance_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC NOT NULL DEFAULT 0 CHECK (amount >= 0),
  cleared_amount NUMERIC NOT NULL DEFAULT 0 CHECK (cleared_amount >= 0),

  purpose TEXT,
  event_name TEXT,
  event_id TEXT,
  project_tag TEXT,

  -- Source / evidence
  payment_slip_url TEXT,
  source_expense_id UUID,

  -- Status
  status TEXT NOT NULL DEFAULT 'outstanding'
    CHECK (status IN ('outstanding', 'partial', 'cleared', 'written_off')),

  notes TEXT,
  submitted_via TEXT DEFAULT 'web' CHECK (submitted_via IN ('web', 'line', 'import'))
);

CREATE INDEX idx_cash_advances_user ON public.cash_advances(user_id);
CREATE INDEX idx_cash_advances_status ON public.cash_advances(user_id, status);
CREATE INDEX idx_cash_advances_recipient ON public.cash_advances(recipient_id);
CREATE INDEX idx_cash_advances_line_user ON public.cash_advances(recipient_line_user_id) WHERE recipient_line_user_id IS NOT NULL;

ALTER TABLE public.cash_advances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own cash advances" ON public.cash_advances
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Accountants view all cash advances" ON public.cash_advances
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'accountant'::app_role));
CREATE POLICY "Users insert own cash advances" ON public.cash_advances
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own cash advances" ON public.cash_advances
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own cash advances" ON public.cash_advances
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Service role full access cash_advances" ON public.cash_advances
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER trg_cash_advances_updated
  BEFORE UPDATE ON public.cash_advances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- Cash Advance Clearances (รายการเคลียร์)
-- =====================================================
CREATE TABLE public.cash_advance_clearances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advance_id UUID NOT NULL REFERENCES public.cash_advances(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  clear_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC NOT NULL DEFAULT 0 CHECK (amount >= 0),
  refund_amount NUMERIC NOT NULL DEFAULT 0 CHECK (refund_amount >= 0),

  expense_id UUID, -- linked real expense (BUSINESS) that hits P&L
  receipt_url TEXT,
  substitute_receipt_url TEXT,
  has_formal_receipt BOOLEAN NOT NULL DEFAULT false,

  description TEXT,
  notes TEXT,
  submitted_via TEXT DEFAULT 'web' CHECK (submitted_via IN ('web', 'line'))
);

CREATE INDEX idx_clearances_advance ON public.cash_advance_clearances(advance_id);
CREATE INDEX idx_clearances_user ON public.cash_advance_clearances(user_id);

ALTER TABLE public.cash_advance_clearances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own clearances" ON public.cash_advance_clearances
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Accountants view all clearances" ON public.cash_advance_clearances
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'accountant'::app_role));
CREATE POLICY "Users insert own clearances" ON public.cash_advance_clearances
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own clearances" ON public.cash_advance_clearances
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own clearances" ON public.cash_advance_clearances
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Service role full access clearances" ON public.cash_advance_clearances
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =====================================================
-- Sync trigger: maintain cleared_amount + status
-- =====================================================
CREATE OR REPLACE FUNCTION public.sync_cash_advance_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_advance_id UUID;
  v_total_cleared NUMERIC;
  v_total_refund NUMERIC;
  v_amount NUMERIC;
  v_new_status TEXT;
BEGIN
  v_advance_id := COALESCE(NEW.advance_id, OLD.advance_id);

  SELECT
    COALESCE(SUM(amount), 0),
    COALESCE(SUM(refund_amount), 0)
  INTO v_total_cleared, v_total_refund
  FROM public.cash_advance_clearances
  WHERE advance_id = v_advance_id;

  SELECT amount INTO v_amount
  FROM public.cash_advances
  WHERE id = v_advance_id;

  -- Effective consumed = cleared + refunded back
  IF (v_total_cleared + v_total_refund) >= v_amount THEN
    v_new_status := 'cleared';
  ELSIF v_total_cleared > 0 OR v_total_refund > 0 THEN
    v_new_status := 'partial';
  ELSE
    v_new_status := 'outstanding';
  END IF;

  UPDATE public.cash_advances
  SET cleared_amount = v_total_cleared,
      status = CASE
        WHEN status = 'written_off' THEN 'written_off'
        ELSE v_new_status
      END,
      updated_at = now()
  WHERE id = v_advance_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_sync_advance_after_clearance
  AFTER INSERT OR UPDATE OR DELETE ON public.cash_advance_clearances
  FOR EACH ROW EXECUTE FUNCTION public.sync_cash_advance_status();