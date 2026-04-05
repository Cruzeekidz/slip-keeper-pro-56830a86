-- Add document classification columns to vendor_invoices
ALTER TABLE public.vendor_invoices
  ADD COLUMN IF NOT EXISTS document_type text NOT NULL DEFAULT 'invoice',
  ADD COLUMN IF NOT EXISTS tax_id text,
  ADD COLUMN IF NOT EXISTS is_formal boolean NOT NULL DEFAULT true;

-- Add index for filtering by document_type
CREATE INDEX IF NOT EXISTS idx_vendor_invoices_document_type ON public.vendor_invoices (document_type);

-- Add index for matched_expense_id lookups
CREATE INDEX IF NOT EXISTS idx_vendor_invoices_matched_expense_id ON public.vendor_invoices (matched_expense_id) WHERE matched_expense_id IS NOT NULL;