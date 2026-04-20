CREATE TABLE public.staff_invoice_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL,
  invoice_number text,
  action text NOT NULL,
  old_status text,
  new_status text,
  changed_by uuid NOT NULL,
  changed_by_email text,
  reason text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_invoice ON public.staff_invoice_audit_log(invoice_id, created_at DESC);

ALTER TABLE public.staff_invoice_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all audit logs"
ON public.staff_invoice_audit_log FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
  OR public.has_role(auth.uid(), 'accountant'::app_role)
  OR auth.uid() = changed_by
);

CREATE POLICY "Authenticated can insert audit logs"
ON public.staff_invoice_audit_log FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = changed_by);