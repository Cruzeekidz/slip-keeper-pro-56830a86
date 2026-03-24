-- ค่าใช้จ่ายอื่นๆ (บันทึกเอง เช่น ค่ามัดจำ ค่าประกัน)
CREATE TABLE public.event_other_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  event_group_id uuid REFERENCES public.event_groups(id) ON DELETE CASCADE,
  event_id text,
  description text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  expense_date date,
  is_refundable boolean NOT NULL DEFAULT false,
  refund_status text NOT NULL DEFAULT 'pending' CHECK (refund_status IN ('pending', 'refunded', 'not_applicable')),
  refunded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.event_other_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own event other expenses"
  ON public.event_other_expenses FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own event other expenses"
  ON public.event_other_expenses FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own event other expenses"
  ON public.event_other_expenses FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own event other expenses"
  ON public.event_other_expenses FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- หมายเหตุอีเวนท์
CREATE TABLE public.event_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  event_group_id uuid REFERENCES public.event_groups(id) ON DELETE CASCADE,
  event_id text,
  note_text text NOT NULL,
  note_type text NOT NULL DEFAULT 'general' CHECK (note_type IN ('general', 'deposit', 'action_required', 'resolved')),
  is_resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.event_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own event notes"
  ON public.event_notes FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own event notes"
  ON public.event_notes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own event notes"
  ON public.event_notes FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own event notes"
  ON public.event_notes FOR DELETE TO authenticated
  USING (auth.uid() = user_id);