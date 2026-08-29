-- Sequences for non-reusable running numbers
CREATE SEQUENCE IF NOT EXISTS public.vendor_bill_receipt_seq START 1;
CREATE SEQUENCE IF NOT EXISTS public.payment_voucher_seq START 1;

-- vendor_invoices: receipt number, wht rate, voucher link
ALTER TABLE public.vendor_invoices ADD COLUMN IF NOT EXISTS receipt_no text;
ALTER TABLE public.vendor_invoices ADD COLUMN IF NOT EXISTS wht_rate numeric NOT NULL DEFAULT 0;
ALTER TABLE public.vendor_invoices ADD COLUMN IF NOT EXISTS voucher_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS vendor_invoices_receipt_no_key ON public.vendor_invoices(receipt_no) WHERE receipt_no IS NOT NULL;

-- payment_vouchers: usable for vendor bill batches (one voucher : many bills)
ALTER TABLE public.payment_vouchers ALTER COLUMN staff_invoice_id DROP NOT NULL;
ALTER TABLE public.payment_vouchers ADD COLUMN IF NOT EXISTS total_amount numeric NOT NULL DEFAULT 0;
ALTER TABLE public.payment_vouchers ADD COLUMN IF NOT EXISTS total_wht numeric NOT NULL DEFAULT 0;
ALTER TABLE public.payment_vouchers ADD COLUMN IF NOT EXISTS total_net numeric NOT NULL DEFAULT 0;
ALTER TABLE public.payment_vouchers ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open';
ALTER TABLE public.payment_vouchers ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.payment_vouchers ADD COLUMN IF NOT EXISTS payment_slip_url text;
ALTER TABLE public.payment_vouchers ADD COLUMN IF NOT EXISTS matched_expense_id uuid;
ALTER TABLE public.payment_vouchers ADD COLUMN IF NOT EXISTS vendor_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS payment_vouchers_voucher_number_key ON public.payment_vouchers(voucher_number);

DO $$ BEGIN
  ALTER TABLE public.vendor_invoices
    ADD CONSTRAINT vendor_invoices_voucher_id_fkey
    FOREIGN KEY (voucher_id) REFERENCES public.payment_vouchers(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_vouchers TO authenticated;
GRANT ALL ON public.payment_vouchers TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.vendor_bill_receipt_seq TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.payment_voucher_seq TO authenticated, service_role;

-- Number issuers (sequence based: never duplicate, never go backwards)
CREATE OR REPLACE FUNCTION public.next_vendor_receipt_no()
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT 'B' || lpad(nextval('public.vendor_bill_receipt_seq')::text, 4, '0');
$$;

CREATE OR REPLACE FUNCTION public.next_payment_voucher_no()
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT 'P' || lpad(nextval('public.payment_voucher_seq')::text, 4, '0');
$$;

REVOKE ALL ON FUNCTION public.next_vendor_receipt_no() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.next_payment_voucher_no() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_vendor_receipt_no() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.next_payment_voucher_no() TO authenticated, service_role;