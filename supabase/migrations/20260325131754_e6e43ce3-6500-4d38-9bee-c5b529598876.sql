
-- Fix: anon cannot query auth.users directly
-- Use a security definer function to validate user_id exists

CREATE OR REPLACE FUNCTION public.is_valid_user_id(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id);
$$;

-- Recreate policies using the security definer function
DROP POLICY IF EXISTS "Anon can insert staff profiles with valid owner" ON public.staff_profiles;
DROP POLICY IF EXISTS "Anon can insert vendor profiles with valid owner" ON public.vendor_profiles;
DROP POLICY IF EXISTS "Anon can insert staff invoices with valid owner" ON public.staff_invoices;
DROP POLICY IF EXISTS "Anon can insert vendor invoices with valid owner" ON public.vendor_invoices;

CREATE POLICY "Anon can insert staff profiles with valid owner"
ON public.staff_profiles
FOR INSERT
TO anon
WITH CHECK (
  user_id IS NOT NULL
  AND public.is_valid_user_id(user_id)
);

CREATE POLICY "Anon can insert vendor profiles with valid owner"
ON public.vendor_profiles
FOR INSERT
TO anon
WITH CHECK (
  user_id IS NOT NULL
  AND public.is_valid_user_id(user_id)
);

CREATE POLICY "Anon can insert staff invoices with valid owner"
ON public.staff_invoices
FOR INSERT
TO anon
WITH CHECK (
  user_id IS NOT NULL
  AND public.is_valid_user_id(user_id)
  AND EXISTS (SELECT 1 FROM public.staff_profiles WHERE id = staff_id AND staff_profiles.user_id = staff_invoices.user_id)
);

CREATE POLICY "Anon can insert vendor invoices with valid owner"
ON public.vendor_invoices
FOR INSERT
TO anon
WITH CHECK (
  user_id IS NOT NULL
  AND public.is_valid_user_id(user_id)
  AND (vendor_id IS NULL OR EXISTS (SELECT 1 FROM public.vendor_profiles WHERE id = vendor_id AND vendor_profiles.user_id = vendor_invoices.user_id))
);
