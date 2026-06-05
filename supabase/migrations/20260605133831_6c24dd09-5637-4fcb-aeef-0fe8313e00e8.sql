
-- Add ID card columns
ALTER TABLE public.staff_profiles 
  ADD COLUMN IF NOT EXISTS id_card_number text,
  ADD COLUMN IF NOT EXISTS id_card_verified_at timestamptz;

ALTER TABLE public.vendor_profiles 
  ADD COLUMN IF NOT EXISTS id_card_url text,
  ADD COLUMN IF NOT EXISTS id_card_number text,
  ADD COLUMN IF NOT EXISTS id_card_verified_at timestamptz;

-- Conversation state table
CREATE TABLE IF NOT EXISTS public.line_conversation_state (
  line_user_id text PRIMARY KEY,
  owner uuid NOT NULL,
  state text NOT NULL,
  draft_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.line_conversation_state TO service_role;

ALTER TABLE public.line_conversation_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role manages conversation state"
  ON public.line_conversation_state FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_line_conversation_state_expires
  ON public.line_conversation_state(expires_at);
