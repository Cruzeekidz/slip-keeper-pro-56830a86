
-- Add transaction_direction and payee_group columns to expenses
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS transaction_direction text NOT NULL DEFAULT 'EXPENSE';
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS payee_group text;

-- Add same columns to deleted_expenses
ALTER TABLE public.deleted_expenses ADD COLUMN IF NOT EXISTS transaction_direction text NOT NULL DEFAULT 'EXPENSE';
ALTER TABLE public.deleted_expenses ADD COLUMN IF NOT EXISTS payee_group text;

-- Create payee_groups table for storing payee group aliases
CREATE TABLE IF NOT EXISTS public.payee_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  payee_pattern text NOT NULL,
  group_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, payee_pattern)
);

ALTER TABLE public.payee_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own payee groups" ON public.payee_groups FOR SELECT TO public USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own payee groups" ON public.payee_groups FOR INSERT TO public WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own payee groups" ON public.payee_groups FOR UPDATE TO public USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own payee groups" ON public.payee_groups FOR DELETE TO public USING (auth.uid() = user_id);
