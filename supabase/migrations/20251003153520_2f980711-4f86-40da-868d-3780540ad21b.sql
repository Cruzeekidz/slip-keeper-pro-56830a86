-- Add transaction_id column to expenses table
ALTER TABLE public.expenses 
ADD COLUMN transaction_id TEXT;

-- Create index for faster lookups
CREATE INDEX idx_expenses_transaction_id ON public.expenses(transaction_id);

-- Create unique constraint to prevent duplicate transactions per user
ALTER TABLE public.expenses 
ADD CONSTRAINT unique_user_transaction UNIQUE (user_id, transaction_id);