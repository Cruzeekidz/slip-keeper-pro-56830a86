-- 1) เลขรับใบเรียกเก็บของทีมงาน: S + running 4 หลัก
CREATE SEQUENCE IF NOT EXISTS public.staff_invoice_receipt_seq START 1;

CREATE OR REPLACE FUNCTION public.next_staff_receipt_no()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'S' || lpad(nextval('public.staff_invoice_receipt_seq')::text, 4, '0');
$$;

REVOKE ALL ON FUNCTION public.next_staff_receipt_no() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_staff_receipt_no() TO authenticated, service_role;

-- 2) staff_invoices: เลขรับ + รวมเข้าใบสรุปจ่ายเดียวกับบิลคู่ค้า
ALTER TABLE public.staff_invoices
  ADD COLUMN IF NOT EXISTS receipt_no text,
  ADD COLUMN IF NOT EXISTS voucher_id uuid REFERENCES public.payment_vouchers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS work_days_note text,
  ADD COLUMN IF NOT EXISTS submitted_via_line_user_id text;

CREATE UNIQUE INDEX IF NOT EXISTS staff_invoices_receipt_no_key
  ON public.staff_invoices (receipt_no) WHERE receipt_no IS NOT NULL;

-- ยอดยังไม่รู้ได้ (คนที่ยังไม่มีค่าแรง/วันในทะเบียน) — ห้ามเดายอด
ALTER TABLE public.staff_invoices
  ALTER COLUMN daily_rate DROP NOT NULL,
  ALTER COLUMN gross_amount DROP NOT NULL,
  ALTER COLUMN net_amount DROP NOT NULL,
  ALTER COLUMN days_worked DROP NOT NULL;

-- 3) ร่างที่รอยืนยันในไลน์ — เตือนซ้ำได้ครั้งเดียว
ALTER TABLE public.line_pending_billings
  ADD COLUMN IF NOT EXISTS reminded_at timestamptz;