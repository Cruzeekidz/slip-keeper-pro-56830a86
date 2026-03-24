CREATE TABLE public.event_product_costs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  event_group_id UUID REFERENCES public.event_groups(id) ON DELETE CASCADE,
  event_id TEXT,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_cost NUMERIC NOT NULL DEFAULT 0,
  total_cost NUMERIC GENERATED ALWAYS AS (quantity * unit_cost) STORED,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.event_product_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own product costs" ON public.event_product_costs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own product costs" ON public.event_product_costs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own product costs" ON public.event_product_costs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own product costs" ON public.event_product_costs FOR DELETE USING (auth.uid() = user_id);