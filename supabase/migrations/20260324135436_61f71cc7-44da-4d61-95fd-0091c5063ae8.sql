
CREATE TABLE public.event_other_income (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  event_group_id uuid REFERENCES public.event_groups(id) ON DELETE CASCADE,
  event_id text,
  description text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  income_date date,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.event_other_income ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own event other income" ON public.event_other_income FOR SELECT TO public USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own event other income" ON public.event_other_income FOR INSERT TO public WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own event other income" ON public.event_other_income FOR UPDATE TO public USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own event other income" ON public.event_other_income FOR DELETE TO public USING (auth.uid() = user_id);
