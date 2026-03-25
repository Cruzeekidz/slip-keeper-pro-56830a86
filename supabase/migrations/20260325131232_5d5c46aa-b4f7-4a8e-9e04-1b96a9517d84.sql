
-- 1. Drop overly permissive anon INSERT policies
DROP POLICY IF EXISTS "Anon can insert staff profiles" ON public.staff_profiles;
DROP POLICY IF EXISTS "Anon can insert vendor profiles" ON public.vendor_profiles;
DROP POLICY IF EXISTS "Anon can insert staff invoices" ON public.staff_invoices;
DROP POLICY IF EXISTS "Anon can insert vendor invoices" ON public.vendor_invoices;

-- 2. Recreate with validation: user_id must be a valid UUID referencing auth.users
-- For staff_profiles: anon can only insert if user_id exists in auth.users
CREATE POLICY "Anon can insert staff profiles with valid owner"
ON public.staff_profiles
FOR INSERT
TO anon
WITH CHECK (
  user_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM auth.users WHERE id = user_id)
);

-- For vendor_profiles: same validation
CREATE POLICY "Anon can insert vendor profiles with valid owner"
ON public.vendor_profiles
FOR INSERT
TO anon
WITH CHECK (
  user_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM auth.users WHERE id = user_id)
);

-- For staff_invoices: anon can only insert if user_id exists AND staff_id references a valid staff profile
CREATE POLICY "Anon can insert staff invoices with valid owner"
ON public.staff_invoices
FOR INSERT
TO anon
WITH CHECK (
  user_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM auth.users WHERE id = user_id)
  AND EXISTS (SELECT 1 FROM public.staff_profiles WHERE id = staff_id AND staff_profiles.user_id = staff_invoices.user_id)
);

-- For vendor_invoices: anon can only insert if user_id exists AND vendor_id references a valid vendor
CREATE POLICY "Anon can insert vendor invoices with valid owner"
ON public.vendor_invoices
FOR INSERT
TO anon
WITH CHECK (
  user_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM auth.users WHERE id = user_id)
  AND (vendor_id IS NULL OR EXISTS (SELECT 1 FROM public.vendor_profiles WHERE id = vendor_id AND vendor_profiles.user_id = vendor_invoices.user_id))
);
