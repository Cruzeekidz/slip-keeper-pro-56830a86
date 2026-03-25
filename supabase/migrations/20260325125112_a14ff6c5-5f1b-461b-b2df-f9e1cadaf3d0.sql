
-- Drop the overly permissive anon SELECT policy on staff_profiles
DROP POLICY IF EXISTS "Anon can read active staff profiles" ON public.staff_profiles;

-- Create a restricted anon SELECT policy using a security definer function
-- that only returns non-sensitive columns
CREATE OR REPLACE FUNCTION public.get_staff_public_info(p_staff_id uuid)
RETURNS TABLE(id uuid, staff_name text, nickname text, daily_rate numeric, user_id uuid, phone text, is_active boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT id, staff_name, nickname, daily_rate, user_id, phone, is_active
  FROM public.staff_profiles
  WHERE staff_profiles.id = p_staff_id AND staff_profiles.is_active = true;
$$;

-- Create a restricted anon policy that only exposes safe columns via a view
CREATE VIEW public.staff_profiles_public AS
  SELECT id, staff_name, nickname, daily_rate, user_id, phone, is_active
  FROM public.staff_profiles
  WHERE is_active = true;

-- Grant anon access to the view only
GRANT SELECT ON public.staff_profiles_public TO anon;
