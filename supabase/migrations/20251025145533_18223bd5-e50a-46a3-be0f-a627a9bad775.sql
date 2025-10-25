-- Add merchant column to expenses table
ALTER TABLE public.expenses 
ADD COLUMN merchant text;