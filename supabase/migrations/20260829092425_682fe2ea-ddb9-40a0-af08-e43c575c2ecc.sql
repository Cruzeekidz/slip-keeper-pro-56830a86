CREATE OR REPLACE FUNCTION public.delete_expenses_with_reason(p_ids uuid[], p_reason text)
RETURNS int
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  PERFORM set_config('app.delete_reason', COALESCE(NULLIF(trim(p_reason), ''), 'ลบจากระบบ (ไม่ระบุแหล่งที่มา)'), true);

  WITH del AS (
    DELETE FROM public.expenses
    WHERE id = ANY(p_ids) AND user_id = auth.uid()
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM del;

  PERFORM set_config('app.delete_reason', '', true);
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_expenses_with_reason(uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_expenses_with_reason(uuid[], text) TO authenticated, service_role;