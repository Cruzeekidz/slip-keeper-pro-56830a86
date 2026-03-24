
CREATE TABLE public.event_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  group_name text NOT NULL,
  project_tag text NOT NULL,
  readygo_event_ids text[] NOT NULL DEFAULT '{}',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.event_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own event groups" ON public.event_groups FOR SELECT TO public USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own event groups" ON public.event_groups FOR INSERT TO public WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own event groups" ON public.event_groups FOR UPDATE TO public USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own event groups" ON public.event_groups FOR DELETE TO public USING (auth.uid() = user_id);
