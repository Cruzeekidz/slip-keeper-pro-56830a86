
-- Add memo-extracted fields to expenses table
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS staff_name text;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS days_worked integer;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS event_name text;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS memo_text text;

-- Add same fields to deleted_expenses for consistency
ALTER TABLE public.deleted_expenses ADD COLUMN IF NOT EXISTS staff_name text;
ALTER TABLE public.deleted_expenses ADD COLUMN IF NOT EXISTS days_worked integer;
ALTER TABLE public.deleted_expenses ADD COLUMN IF NOT EXISTS event_name text;
ALTER TABLE public.deleted_expenses ADD COLUMN IF NOT EXISTS memo_text text;

-- Create table to buffer LINE text messages as memos
CREATE TABLE public.line_pending_memos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  line_user_id text NOT NULL,
  memo_text text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Allow service role full access (no RLS needed - only used by edge functions with service role key)
ALTER TABLE public.line_pending_memos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON public.line_pending_memos
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Auto-cleanup old memos (older than 10 minutes) via index for efficient querying
CREATE INDEX idx_line_pending_memos_user ON public.line_pending_memos (line_user_id, created_at DESC);
