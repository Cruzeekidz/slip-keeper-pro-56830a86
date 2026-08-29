-- 1) Backup-before-delete trigger on expenses
CREATE OR REPLACE FUNCTION public.archive_expense_before_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reason text;
BEGIN
  v_reason := COALESCE(NULLIF(current_setting('app.delete_reason', true), ''), 'ลบจากระบบ (ไม่ระบุแหล่งที่มา)');

  INSERT INTO public.deleted_expenses (
    user_id, original_expense_id, amount, category, subcategory, project, description,
    expense_date, expense_time, merchant, sender, receiver, transaction_id, receipt_url,
    deleted_at, deleted_reason, can_restore, transaction_type, category_group, project_tag,
    confidence_score, needs_review, transaction_direction, payee_group, staff_name,
    days_worked, event_name, memo_text, is_cash
  ) VALUES (
    OLD.user_id, OLD.id, OLD.amount, OLD.category, OLD.subcategory, OLD.project, OLD.description,
    OLD.expense_date, OLD.expense_time, OLD.merchant, OLD.sender, OLD.receiver, OLD.transaction_id, OLD.receipt_url,
    now(), v_reason, true, OLD.transaction_type, OLD.category_group, OLD.project_tag,
    OLD.confidence_score, OLD.needs_review, OLD.transaction_direction, OLD.payee_group, OLD.staff_name,
    OLD.days_worked, OLD.event_name, OLD.memo_text, OLD.is_cash
  );

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_archive_expense_before_delete ON public.expenses;
CREATE TRIGGER trg_archive_expense_before_delete
BEFORE DELETE ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.archive_expense_before_delete();

-- 2) Recurring payees (per-receiver mute for rule 3)
CREATE TABLE IF NOT EXISTS public.recurring_payees (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  receiver_name text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, receiver_name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recurring_payees TO authenticated;
GRANT ALL ON public.recurring_payees TO service_role;

ALTER TABLE public.recurring_payees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own recurring payees" ON public.recurring_payees;
CREATE POLICY "Users manage own recurring payees"
ON public.recurring_payees FOR ALL TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 3) Server-side duplicate group finder
CREATE OR REPLACE FUNCTION public.find_duplicate_groups(
  p_mode text DEFAULT 'exact',
  p_days int DEFAULT 90,
  p_hide_recurring boolean DEFAULT true,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE(group_key text, reason text, items jsonb, total_groups bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
WITH base AS (
  SELECT e.id, e.amount, e.category, e.subcategory, e.description, e.expense_date, e.expense_time,
         e.merchant, e.sender, e.receiver, e.transaction_id, e.receipt_url, e.created_at,
         e.project_tag, e.event_name, e.non_duplicate_pairs,
         COALESCE(NULLIF(e.receiver, ''), NULLIF(e.merchant, '')) AS recv
  FROM public.expenses e
  WHERE e.user_id = auth.uid()
),
r1 AS (
  SELECT 'tx-' || transaction_id AS gk,
         'รหัสอ้างอิงเดียวกัน: ' || transaction_id AS reason,
         array_agg(id) AS ids
  FROM base
  WHERE p_mode = 'exact' AND transaction_id IS NOT NULL AND transaction_id <> ''
  GROUP BY transaction_id
  HAVING count(*) > 1
),
r1ids AS (SELECT unnest(ids) AS id FROM r1),
r2 AS (
  SELECT 'amt-' || b.amount || '-' || b.expense_date || '-' || COALESCE(b.expense_time::text, '') AS gk,
         'ยอดโอนและเวลาเดียวกัน: ฿' || b.amount || COALESCE(' เวลา ' || b.expense_time::text, '') AS reason,
         array_agg(b.id) AS ids
  FROM base b
  WHERE p_mode = 'exact' AND NOT EXISTS (SELECT 1 FROM r1ids WHERE r1ids.id = b.id)
  GROUP BY b.amount, b.expense_date, b.expense_time
  HAVING count(*) > 1
),
r3 AS (
  SELECT 'recv-' || b.recv || '-' || b.amount AS gk,
         '⚠️ จ่าย ฿' || b.amount || ' ให้ "' || b.recv || '" หลายครั้ง' AS reason,
         array_agg(b.id) AS ids
  FROM base b
  WHERE p_mode = 'recurring'
    AND b.recv IS NOT NULL
    AND b.expense_date >= (current_date - GREATEST(p_days, 1))
    AND (
      NOT p_hide_recurring
      OR NOT EXISTS (
        SELECT 1 FROM public.recurring_payees rp
        WHERE rp.user_id = auth.uid() AND rp.receiver_name = b.recv
      )
    )
  GROUP BY b.recv, b.amount
  HAVING count(*) > 1
),
grp AS (
  SELECT gk, reason, ids FROM r1
  UNION ALL SELECT gk, reason, ids FROM r2
  UNION ALL SELECT gk, reason, ids FROM r3
),
mem AS (
  SELECT g.gk, g.reason, b.*
  FROM grp g
  JOIN base b ON b.id = ANY(g.ids)
),
pairs AS (
  SELECT m.gk, substring(p, 1, 36)::uuid AS a, substring(p, 38, 36)::uuid AS b
  FROM mem m, unnest(COALESCE(m.non_duplicate_pairs, '{}'::text[])) AS p
  WHERE length(p) = 73
),
valid_pairs AS (
  SELECT p.gk, p.a, p.b
  FROM pairs p JOIN grp g ON g.gk = p.gk
  WHERE p.a = ANY(g.ids) AND p.b = ANY(g.ids)
),
marked AS (
  SELECT gk, a AS id FROM valid_pairs
  UNION SELECT gk, b AS id FROM valid_pairs
),
kept AS (
  SELECT m.* FROM mem m
  WHERE NOT EXISTS (SELECT 1 FROM marked k WHERE k.gk = m.gk AND k.id = m.id)
),
final AS (
  SELECT k.gk, k.reason,
         jsonb_agg(
           jsonb_build_object(
             'id', k.id, 'amount', k.amount, 'category', k.category, 'subcategory', k.subcategory,
             'description', k.description, 'expense_date', k.expense_date, 'expense_time', k.expense_time,
             'merchant', k.merchant, 'sender', k.sender, 'receiver', k.receiver,
             'transaction_id', k.transaction_id, 'receipt_url', k.receipt_url, 'created_at', k.created_at,
             'project_tag', k.project_tag, 'event_name', k.event_name,
             'non_duplicate_pairs', COALESCE(k.non_duplicate_pairs, '{}'::text[])
           ) ORDER BY k.expense_date DESC, k.created_at DESC
         ) AS items
  FROM kept k
  GROUP BY k.gk, k.reason
  HAVING count(*) > 1
)
SELECT f.gk, f.reason, f.items, (SELECT count(*) FROM final)
FROM final f
ORDER BY f.gk
LIMIT GREATEST(p_limit, 1) OFFSET GREATEST(p_offset, 0);
$$;

REVOKE ALL ON FUNCTION public.find_duplicate_groups(text, int, boolean, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_duplicate_groups(text, int, boolean, int, int) TO authenticated, service_role;

-- 4) Pending-task counters for the home screen
CREATE OR REPLACE FUNCTION public.get_pending_counts()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'needs_review', (SELECT count(*) FROM public.expenses WHERE user_id = auth.uid() AND needs_review IS TRUE),
    'duplicates', (SELECT count(*) FROM public.find_duplicate_groups('exact', 90, true, 100000, 0)),
    'missing_tag', (SELECT count(*) FROM public.expenses
                    WHERE user_id = auth.uid() AND transaction_type = 'BUSINESS'
                      AND project_tag IS NULL AND expense_date >= (current_date - 90)),
    'suspicious_date', (SELECT count(*) FROM public.expenses WHERE user_id = auth.uid() AND date_flag_reason IS NOT NULL)
  );
$$;

REVOKE ALL ON FUNCTION public.get_pending_counts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_pending_counts() TO authenticated, service_role;