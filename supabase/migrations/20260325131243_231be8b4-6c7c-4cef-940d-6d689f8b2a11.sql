
-- Fix SECURITY DEFINER view by recreating with security_invoker=on
DROP VIEW IF EXISTS public.staff_profiles_public;

CREATE VIEW public.staff_profiles_public
WITH (security_invoker=on) AS
  SELECT id, staff_name, nickname, daily_rate, user_id, phone, is_active
  FROM public.staff_profiles
  WHERE is_active = true;

-- Grant anon SELECT on the view
GRANT SELECT ON public.staff_profiles_public TO anon;

-- Add a SELECT policy for anon on staff_profiles so the view can read through it
CREATE POLICY "Anon can select active staff via view"
ON public.staff_profiles
FOR SELECT
TO anon
USING (is_active = true);
