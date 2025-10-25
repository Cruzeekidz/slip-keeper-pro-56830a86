-- Add sender and receiver columns to expenses table
ALTER TABLE public.expenses 
ADD COLUMN IF NOT EXISTS sender TEXT,
ADD COLUMN IF NOT EXISTS receiver TEXT;