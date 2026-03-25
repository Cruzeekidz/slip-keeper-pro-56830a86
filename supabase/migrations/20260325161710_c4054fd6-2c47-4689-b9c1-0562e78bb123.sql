
-- WHT Certificates table
CREATE TABLE public.wht_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  doc_number text,
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  pnd_type text NOT NULL DEFAULT '3',
  payer_condition text NOT NULL DEFAULT 'deducted',
  
  -- Payer info
  payer_name text,
  payer_tax_id text,
  payer_address text,
  
  -- Payee info
  payee_name text NOT NULL,
  payee_tax_id text,
  payee_address text,
  payee_type text NOT NULL DEFAULT 'individual',
  payee_source text,
  payee_source_id uuid,
  
  -- Totals
  total_gross numeric NOT NULL DEFAULT 0,
  total_tax numeric NOT NULL DEFAULT 0,
  total_tax_text text,
  
  -- Source reference
  source_invoice_id uuid,
  source_type text,
  
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- WHT Certificate line items
CREATE TABLE public.wht_certificate_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  certificate_id uuid NOT NULL REFERENCES public.wht_certificates(id) ON DELETE CASCADE,
  income_type_index integer NOT NULL DEFAULT 2,
  income_type_label text NOT NULL,
  payment_date date,
  gross_amount numeric NOT NULL DEFAULT 0,
  tax_rate numeric NOT NULL DEFAULT 3,
  tax_amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.wht_certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wht_certificate_items ENABLE ROW LEVEL SECURITY;

-- RLS for wht_certificates
CREATE POLICY "Users can CRUD their own certificates" ON public.wht_certificates FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- RLS for wht_certificate_items
CREATE POLICY "Users can CRUD their own certificate items" ON public.wht_certificate_items FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.wht_certificates WHERE id = wht_certificate_items.certificate_id AND user_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.wht_certificates WHERE id = wht_certificate_items.certificate_id AND user_id = auth.uid()));
