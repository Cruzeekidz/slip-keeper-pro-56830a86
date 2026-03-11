
-- Drop old restrictive UPDATE/DELETE policies
DROP POLICY IF EXISTS "Users can update line_user_roles" ON public.line_user_roles;
DROP POLICY IF EXISTS "Users can delete line_user_roles" ON public.line_user_roles;

-- Allow authenticated users to update any line_user_roles (admin manages all)
CREATE POLICY "Authenticated can update line_user_roles"
  ON public.line_user_roles FOR UPDATE TO authenticated
  USING (true);

CREATE POLICY "Authenticated can delete line_user_roles"
  ON public.line_user_roles FOR DELETE TO authenticated
  USING (true);
