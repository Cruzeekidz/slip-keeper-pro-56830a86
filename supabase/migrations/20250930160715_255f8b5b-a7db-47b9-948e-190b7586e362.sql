-- Remove the category check constraint to allow any category value
ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_category_check;