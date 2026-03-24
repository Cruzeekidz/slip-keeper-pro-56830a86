
-- Staff profiles table
CREATE TABLE public.staff_profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  staff_name text NOT NULL,
  nickname text,
  tax_id text,
  daily_rate numeric NOT NULL DEFAULT 0,
  phone text,
  line_user_id text,
  bank_name text,
  bank_account text,
  address text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.staff_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own staff" ON public.staff_profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own staff" ON public.staff_profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own staff" ON public.staff_profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own staff" ON public.staff_profiles FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Staff invoices table
CREATE TABLE public.staff_invoices (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  staff_id uuid REFERENCES public.staff_profiles(id) ON DELETE CASCADE NOT NULL,
  invoice_number text NOT NULL,
  event_id text,
  event_name text,
  days_worked numeric NOT NULL DEFAULT 1,
  daily_rate numeric NOT NULL DEFAULT 0,
  gross_amount numeric NOT NULL DEFAULT 0,
  wht_rate numeric NOT NULL DEFAULT 3,
  wht_amount numeric NOT NULL DEFAULT 0,
  net_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  work_start_date date,
  work_end_date date,
  notes text,
  submitted_via text DEFAULT 'web',
  submitted_at timestamp with time zone,
  paid_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.staff_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own staff invoices" ON public.staff_invoices FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own staff invoices" ON public.staff_invoices FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own staff invoices" ON public.staff_invoices FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own staff invoices" ON public.staff_invoices FOR DELETE TO authenticated USING (auth.uid() = user_id);
-- Allow anon insert for public form
CREATE POLICY "Anon can insert staff invoices" ON public.staff_invoices FOR INSERT TO anon WITH CHECK (true);

-- Payment vouchers table
CREATE TABLE public.payment_vouchers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  staff_invoice_id uuid REFERENCES public.staff_invoices(id) ON DELETE CASCADE NOT NULL,
  voucher_number text NOT NULL,
  paid_date date,
  pdf_url text,
  wht_cert_url text,
  signed_url text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_vouchers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own vouchers" ON public.payment_vouchers FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own vouchers" ON public.payment_vouchers FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own vouchers" ON public.payment_vouchers FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own vouchers" ON public.payment_vouchers FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Documents storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', false);

-- Storage policies for documents bucket
CREATE POLICY "Users can upload documents" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users can view their own documents" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users can delete their own documents" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);
