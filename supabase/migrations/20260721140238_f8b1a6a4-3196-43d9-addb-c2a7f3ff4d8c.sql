
-- 1. Drop anon SELECT policies that leak PII / business data
DROP POLICY IF EXISTS "Anon can select active staff via view" ON public.staff_profiles;
DROP POLICY IF EXISTS "Anon can read active events" ON public.event_registry;

-- 2. Drop anon INSERT policies (portal must now go through verified edge function)
DROP POLICY IF EXISTS "Anon can insert staff profiles with valid owner"  ON public.staff_profiles;
DROP POLICY IF EXISTS "Anon can insert vendor profiles with valid owner" ON public.vendor_profiles;
DROP POLICY IF EXISTS "Anon can insert staff invoices with valid owner"  ON public.staff_invoices;
DROP POLICY IF EXISTS "Anon can insert expense claims with valid owner"  ON public.staff_expense_claims;
DROP POLICY IF EXISTS "Anon can insert vendor invoices with valid owner" ON public.vendor_invoices;

-- 3. Drop anon storage upload policy for vendor bills (portal edge function now uploads via service role)
DROP POLICY IF EXISTS "Anon can upload vendor bills to receipts" ON storage.objects;

-- 4. Revoke SECURITY DEFINER function EXECUTE from public roles where not needed.
-- Trigger functions: only the table owner calls them.
REVOKE ALL ON FUNCTION public.sync_cash_advance_status()   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_expense_date()      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column()   FROM PUBLIC, anon, authenticated;

-- Linking RPCs: only called by service-role from edge functions (line-webhook, portal-submit).
REVOKE ALL ON FUNCTION public.link_staff_line_id(uuid,text,text,uuid)         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.link_vendor_line_id(uuid,text,text,text,uuid)   FROM PUBLIC, anon, authenticated;

-- Owner-validity helper: only referenced inside SECURITY DEFINER RPCs and other server code.
REVOKE ALL ON FUNCTION public.is_valid_user_id(uuid) FROM PUBLIC, anon, authenticated;

-- has_role() must stay callable by authenticated (RLS policies invoke it as caller).
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;

-- get_wht_certificate_public / get_staff_public_info are intentionally public.
GRANT EXECUTE ON FUNCTION public.get_wht_certificate_public(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_staff_public_info(uuid)      TO anon, authenticated;

-- 5. Provide a SECURITY DEFINER helper the portal edge function uses to list active events
-- for a verified LINE user under a given owner (no more anon SELECT on event_registry).
CREATE OR REPLACE FUNCTION public.portal_list_active_events(p_owner uuid, p_since date)
RETURNS TABLE(id uuid, event_name text, event_date date)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, event_name, event_date
  FROM public.event_registry
  WHERE user_id = p_owner
    AND is_active = true
    AND (event_date IS NULL OR event_date >= p_since)
  ORDER BY event_date DESC NULLS LAST;
$$;
REVOKE ALL ON FUNCTION public.portal_list_active_events(uuid, date) FROM PUBLIC, anon, authenticated;
-- service_role always retains access; explicit grant for clarity
GRANT EXECUTE ON FUNCTION public.portal_list_active_events(uuid, date) TO service_role;
