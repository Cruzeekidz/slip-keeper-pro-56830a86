
-- Pending billings: เก็บข้อความ "วางบิล/ใบเสร็จ" รอจับคู่กับรูปที่ส่งตามมา
CREATE TABLE public.line_pending_billings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  line_user_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('billing', 'receipt')),
  amount NUMERIC,
  description TEXT,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '10 minutes'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_line_pending_billings_user ON public.line_pending_billings(line_user_id, expires_at DESC);

ALTER TABLE public.line_pending_billings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access pending billings"
ON public.line_pending_billings FOR ALL
TO service_role
USING (true) WITH CHECK (true);

-- Track ผู้ส่งใบวางบิลผ่าน LINE
ALTER TABLE public.vendor_invoices
  ADD COLUMN IF NOT EXISTS submitted_via_line_user_id TEXT,
  ADD COLUMN IF NOT EXISTS submitted_via_line_display_name TEXT;

CREATE INDEX IF NOT EXISTS idx_vendor_invoices_pending_status
  ON public.vendor_invoices(user_id, status)
  WHERE status = 'pending';
