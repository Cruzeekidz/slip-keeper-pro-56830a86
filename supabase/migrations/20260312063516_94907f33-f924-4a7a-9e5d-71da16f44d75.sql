
CREATE TABLE public.link_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  code text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  used boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(code)
);

ALTER TABLE public.link_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create their own link codes"
  ON public.link_codes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own link codes"
  ON public.link_codes FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own link codes"
  ON public.link_codes FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access on link_codes"
  ON public.link_codes FOR ALL TO service_role
  USING (true) WITH CHECK (true);
