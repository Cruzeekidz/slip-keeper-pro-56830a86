
-- Table to map LINE user IDs to Supabase users
CREATE TABLE public.line_user_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  line_user_id text NOT NULL UNIQUE,
  supabase_user_id uuid NOT NULL,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.line_user_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own mappings"
  ON public.line_user_mappings FOR SELECT
  TO authenticated
  USING (auth.uid() = supabase_user_id);

CREATE POLICY "Users can create their own mappings"
  ON public.line_user_mappings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = supabase_user_id);

CREATE POLICY "Users can delete their own mappings"
  ON public.line_user_mappings FOR DELETE
  TO authenticated
  USING (auth.uid() = supabase_user_id);

-- Allow service role to read mappings (for webhook)
CREATE POLICY "Service role can read all mappings"
  ON public.line_user_mappings FOR SELECT
  TO service_role
  USING (true);
