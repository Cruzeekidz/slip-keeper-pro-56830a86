
-- Create staff expense claims table
CREATE TABLE public.staff_expense_claims (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  staff_id uuid NOT NULL REFERENCES public.staff_profiles(id),
  invoice_id uuid REFERENCES public.staff_invoices(id),
  event_id text,
  event_name text,
  category text NOT NULL DEFAULT 'อื่นๆ',
  description text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  receipt_url text,
  has_formal_receipt boolean NOT NULL DEFAULT false,
  substitute_receipt_url text,
  approver_signature_url text,
  claimant_signature_url text,
  status text NOT NULL DEFAULT 'submitted',
  notes text,
  expense_date date,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.staff_expense_claims ENABLE ROW LEVEL SECURITY;

-- Authenticated user policies
CREATE POLICY "Users can view their own expense claims"
  ON public.staff_expense_claims FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own expense claims"
  ON public.staff_expense_claims FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own expense claims"
  ON public.staff_expense_claims FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own expense claims"
  ON public.staff_expense_claims FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Anon can submit claims (from staff portal)
CREATE POLICY "Anon can insert expense claims with valid owner"
  ON public.staff_expense_claims FOR INSERT TO anon
  WITH CHECK (
    user_id IS NOT NULL
    AND is_valid_user_id(user_id)
    AND EXISTS (
      SELECT 1 FROM staff_profiles
      WHERE staff_profiles.id = staff_expense_claims.staff_id
        AND staff_profiles.user_id = staff_expense_claims.user_id
    )
  );

-- Indexes
CREATE INDEX idx_staff_expense_claims_staff_id ON public.staff_expense_claims(staff_id);
CREATE INDEX idx_staff_expense_claims_user_id ON public.staff_expense_claims(user_id);
CREATE INDEX idx_staff_expense_claims_invoice_id ON public.staff_expense_claims(invoice_id) WHERE invoice_id IS NOT NULL;
