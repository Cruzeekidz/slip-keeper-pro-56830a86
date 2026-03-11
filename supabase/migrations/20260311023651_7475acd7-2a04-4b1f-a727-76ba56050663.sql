
CREATE TABLE public.forward_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  line_user_id text NOT NULL,
  display_name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  forward_image boolean NOT NULL DEFAULT true,
  forward_summary boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, line_user_id)
);

ALTER TABLE public.forward_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own forward recipients" ON public.forward_recipients FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own forward recipients" ON public.forward_recipients FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own forward recipients" ON public.forward_recipients FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own forward recipients" ON public.forward_recipients FOR DELETE USING (auth.uid() = user_id);

-- Service role needs access for the webhook
CREATE POLICY "Service role full access on forward_recipients" ON public.forward_recipients FOR SELECT TO service_role USING (true);
