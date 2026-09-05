CREATE OR REPLACE FUNCTION public.find_duplicate_groups(p_mode text DEFAULT 'exact'::text, p_days integer DEFAULT 90, p_hide_recurring boolean DEFAULT true, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(group_key text, reason text, items jsonb, total_groups bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
WITH base AS (
  SELECT e.id, e.amount, e.wht_amount, e.category, e.subcategory, e.description, e.expense_date, e.expense_time,
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
r4 AS (
  SELECT 'gn-' || g.id || '-' || n.id AS gk,
         'ยอดเต็ม ฿' || g.amount || ' (หัก ณ ที่จ่าย ฿' || g.wht_amount
           || ') กับยอดโอน ฿' || n.amount || ' อาจเป็นสลิปใบเดียวกัน' AS reason,
         ARRAY[g.id, n.id] AS ids
  FROM base g
  JOIN base n
    ON n.id <> g.id
   AND abs((g.amount - COALESCE(g.wht_amount, 0)) - n.amount) <= 0.5
   AND abs(n.expense_date - g.expense_date) <= 7
  WHERE p_mode = 'grossnet'
    AND COALESCE(g.wht_amount, 0) > 0
    AND COALESCE(n.wht_amount, 0) = 0
    AND g.expense_date >= (current_date - GREATEST(p_days, 1))
),
grp AS (
  SELECT gk, reason, ids FROM r1
  UNION ALL SELECT gk, reason, ids FROM r2
  UNION ALL SELECT gk, reason, ids FROM r3
  UNION ALL SELECT gk, reason, ids FROM r4
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
$function$;