
CREATE TABLE public.event_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  event_name text NOT NULL,
  aliases text[] NOT NULL DEFAULT '{}',
  event_date date,
  project_tag text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.event_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own events" ON public.event_registry FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own events" ON public.event_registry FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own events" ON public.event_registry FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own events" ON public.event_registry FOR DELETE USING (auth.uid() = user_id);
