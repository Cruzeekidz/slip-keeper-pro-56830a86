
-- Fix line_user_roles: scope UPDATE and DELETE to owner only
DROP POLICY IF EXISTS "Authenticated can delete line_user_roles" ON public.line_user_roles;
DROP POLICY IF EXISTS "Authenticated can update line_user_roles" ON public.line_user_roles;

CREATE POLICY "Users can delete their own line_user_roles"
ON public.line_user_roles
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own line_user_roles"
ON public.line_user_roles
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);
