
-- Create line_user_roles table
CREATE TABLE public.line_user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  line_user_id text NOT NULL,
  display_name text,
  role text NOT NULL DEFAULT 'member',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  user_id uuid,
  UNIQUE(line_user_id)
);

-- Enable RLS
ALTER TABLE public.line_user_roles ENABLE ROW LEVEL SECURITY;

-- Service role full access (for webhook)
CREATE POLICY "Service role full access on line_user_roles"
  ON public.line_user_roles FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Authenticated users can manage roles (only their own entries via user_id)
CREATE POLICY "Users can view line_user_roles"
  ON public.line_user_roles FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Users can insert line_user_roles"
  ON public.line_user_roles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update line_user_roles"
  ON public.line_user_roles FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete line_user_roles"
  ON public.line_user_roles FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
