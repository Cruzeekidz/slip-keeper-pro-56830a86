
-- 1. Create wht_remittance_batches table
CREATE TABLE public.wht_remittance_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  batch_month text NOT NULL,
  pnd_type text NOT NULL DEFAULT '3',
  total_tax numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  filed_at timestamptz,
  paid_at timestamptz,
  paid_expense_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.wht_remittance_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD their own batches" ON public.wht_remittance_batches FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 2. Create wht_remittance_items table
CREATE TABLE public.wht_remittance_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.wht_remittance_batches(id) ON DELETE CASCADE,
  source_type text NOT NULL DEFAULT 'staff_invoice',
  source_id uuid NOT NULL,
  payee_name text NOT NULL,
  gross_amount numeric NOT NULL DEFAULT 0,
  wht_amount numeric NOT NULL DEFAULT 0,
  flowaccount_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.wht_remittance_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD their own remittance items" ON public.wht_remittance_items FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.wht_remittance_batches WHERE wht_remittance_batches.id = wht_remittance_items.batch_id AND wht_remittance_batches.user_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.wht_remittance_batches WHERE wht_remittance_batches.id = wht_remittance_items.batch_id AND wht_remittance_batches.user_id = auth.uid()));

-- 3. Add settled_batch_id to expenses
ALTER TABLE public.expenses ADD COLUMN settled_batch_id uuid REFERENCES public.wht_remittance_batches(id);
