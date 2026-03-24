
-- Vendor profiles table
CREATE TABLE public.vendor_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  vendor_type TEXT NOT NULL DEFAULT 'company', -- company, individual
  company_name TEXT NOT NULL,
  tax_id TEXT,
  contact_name TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  bank_name TEXT,
  bank_account TEXT,
  tax_doc_url TEXT, -- ภพ.20 or ID card
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.vendor_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own vendors" ON public.vendor_profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own vendors" ON public.vendor_profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own vendors" ON public.vendor_profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own vendors" ON public.vendor_profiles FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Anon can insert vendor profiles" ON public.vendor_profiles FOR INSERT TO anon WITH CHECK (true);

-- Vendor invoices table
CREATE TABLE public.vendor_invoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  vendor_id UUID REFERENCES public.vendor_profiles(id),
  invoice_number TEXT,
  invoice_date DATE,
  due_date DATE,
  amount NUMERIC NOT NULL DEFAULT 0,
  vat_amount NUMERIC NOT NULL DEFAULT 0,
  wht_amount NUMERIC NOT NULL DEFAULT 0,
  net_amount NUMERIC NOT NULL DEFAULT 0,
  description TEXT,
  file_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, approved, paid
  ocr_data JSONB,
  notes TEXT,
  paid_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.vendor_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own vendor invoices" ON public.vendor_invoices FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own vendor invoices" ON public.vendor_invoices FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own vendor invoices" ON public.vendor_invoices FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own vendor invoices" ON public.vendor_invoices FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Anon can insert vendor invoices" ON public.vendor_invoices FOR INSERT TO anon WITH CHECK (true);

-- Allow anon to read staff_profiles for public forms
CREATE POLICY "Anon can read active staff profiles" ON public.staff_profiles FOR SELECT TO anon USING (is_active = true);

-- Allow anon to insert staff_profiles for self-registration
CREATE POLICY "Anon can insert staff profiles" ON public.staff_profiles FOR INSERT TO anon WITH CHECK (true);

-- Allow anon to read event_registry for public forms
CREATE POLICY "Anon can read active events" ON public.event_registry FOR SELECT TO anon USING (is_active = true);
