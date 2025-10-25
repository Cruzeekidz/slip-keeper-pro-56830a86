-- Add subcategory column to expenses table
ALTER TABLE public.expenses 
ADD COLUMN subcategory text;