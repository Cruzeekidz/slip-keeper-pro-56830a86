-- Add position and id_card_url to staff_profiles
ALTER TABLE public.staff_profiles ADD COLUMN IF NOT EXISTS position text;
ALTER TABLE public.staff_profiles ADD COLUMN IF NOT EXISTS id_card_url text;

-- Add bonus_amount to staff_invoices
ALTER TABLE public.staff_invoices ADD COLUMN IF NOT EXISTS bonus_amount numeric NOT NULL DEFAULT 0;