ALTER TABLE public.staff_expense_claims
  ADD COLUMN IF NOT EXISTS vendor_invoice_id uuid REFERENCES public.vendor_invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reimbursed_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS reimbursed_expense_id uuid REFERENCES public.expenses(id) ON DELETE SET NULL;

ALTER TABLE public.vendor_invoices
  ADD COLUMN IF NOT EXISTS link_type text NOT NULL DEFAULT 'vendor',
  ADD COLUMN IF NOT EXISTS linked_staff_id uuid REFERENCES public.staff_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_staff_expense_claims_vendor_invoice ON public.staff_expense_claims(vendor_invoice_id);
CREATE INDEX IF NOT EXISTS idx_vendor_invoices_linked_staff ON public.vendor_invoices(linked_staff_id);