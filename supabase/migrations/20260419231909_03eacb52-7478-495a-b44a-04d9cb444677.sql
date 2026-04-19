
CREATE TABLE IF NOT EXISTS public.bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  account_name text NOT NULL,
  account_number text NOT NULL,
  bank_name text NOT NULL,
  entity text,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own bank accounts" ON public.bank_accounts FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own bank accounts" ON public.bank_accounts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own bank accounts" ON public.bank_accounts FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own bank accounts" ON public.bank_accounts FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER update_bank_accounts_updated_at
  BEFORE UPDATE ON public.bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS sender_account_name text,
  ADD COLUMN IF NOT EXISTS sender_account_number text,
  ADD COLUMN IF NOT EXISTS sender_bank text,
  ADD COLUMN IF NOT EXISTS receiver_account_name text,
  ADD COLUMN IF NOT EXISTS receiver_account_number text,
  ADD COLUMN IF NOT EXISTS receiver_bank text;

CREATE POLICY "Accountants can view all expenses" ON public.expenses FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'accountant'::app_role));
CREATE POLICY "Accountants can view all staff_invoices" ON public.staff_invoices FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'accountant'::app_role));
CREATE POLICY "Accountants can view all vendor_invoices" ON public.vendor_invoices FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'accountant'::app_role));
CREATE POLICY "Accountants can view all staff_profiles" ON public.staff_profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'accountant'::app_role));
CREATE POLICY "Accountants can view all vendor_profiles" ON public.vendor_profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'accountant'::app_role));
CREATE POLICY "Accountants can view all wht_certificates" ON public.wht_certificates FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'accountant'::app_role));
CREATE POLICY "Accountants can view all wht_remittance_batches" ON public.wht_remittance_batches FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'accountant'::app_role));
CREATE POLICY "Accountants can view all wht_remittance_items" ON public.wht_remittance_items FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'accountant'::app_role));
CREATE POLICY "Accountants can view all wht_certificate_items" ON public.wht_certificate_items FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'accountant'::app_role));
CREATE POLICY "Accountants can view all bank_accounts" ON public.bank_accounts FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'accountant'::app_role));

CREATE POLICY "Accountants can read receipts bucket" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'receipts' AND public.has_role(auth.uid(), 'accountant'::app_role));
CREATE POLICY "Accountants can read documents bucket" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'documents' AND public.has_role(auth.uid(), 'accountant'::app_role));
