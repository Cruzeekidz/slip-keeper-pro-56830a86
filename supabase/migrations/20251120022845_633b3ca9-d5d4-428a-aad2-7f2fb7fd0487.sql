-- Create table to store deleted expenses for recovery
CREATE TABLE IF NOT EXISTS public.deleted_expenses (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  original_expense_id uuid NOT NULL,
  amount numeric NOT NULL,
  category text NOT NULL,
  subcategory text,
  project text,
  description text,
  expense_date date NOT NULL,
  expense_time time,
  merchant text,
  sender text,
  receiver text,
  transaction_id text,
  receipt_url text,
  deleted_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_reason text,
  can_restore boolean DEFAULT true
);

-- Enable RLS
ALTER TABLE public.deleted_expenses ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own deleted expenses"
  ON public.deleted_expenses
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own deleted expenses"
  ON public.deleted_expenses
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own deleted expenses"
  ON public.deleted_expenses
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own deleted expenses"
  ON public.deleted_expenses
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create index for faster queries
CREATE INDEX idx_deleted_expenses_user_id ON public.deleted_expenses(user_id);
CREATE INDEX idx_deleted_expenses_deleted_at ON public.deleted_expenses(deleted_at DESC);