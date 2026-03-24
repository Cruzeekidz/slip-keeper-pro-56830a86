
-- ระบบแจ้งเตือน: วางบิล, เช็คยอดโอน, ทวงคืนมัดจำ, ค่าใช้จ่ายค้างจ่าย
CREATE TABLE public.event_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  event_group_id uuid REFERENCES public.event_groups(id) ON DELETE CASCADE,
  event_id text,
  reminder_type text NOT NULL DEFAULT 'billing',
  title text NOT NULL,
  description text,
  amount numeric DEFAULT 0,
  due_date date NOT NULL,
  remind_before_days integer NOT NULL DEFAULT 1,
  is_completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  notify_line boolean NOT NULL DEFAULT true,
  notify_gcal boolean NOT NULL DEFAULT false,
  line_notified_at timestamptz,
  gcal_event_id text,
  related_expense_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.event_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own reminders"
  ON public.event_reminders FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own reminders"
  ON public.event_reminders FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own reminders"
  ON public.event_reminders FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own reminders"
  ON public.event_reminders FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
