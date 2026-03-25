ALTER TABLE public.wht_certificates 
ADD COLUMN IF NOT EXISTS flowaccount_url text,
ADD COLUMN IF NOT EXISTS sent_to_payee boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS sent_at timestamptz;