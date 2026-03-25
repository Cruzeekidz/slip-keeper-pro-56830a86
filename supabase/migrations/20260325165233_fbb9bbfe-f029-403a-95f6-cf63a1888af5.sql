CREATE OR REPLACE FUNCTION public.get_wht_certificate_public(p_cert_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'certificate', row_to_json(c),
    'items', COALESCE((
      SELECT jsonb_agg(row_to_json(i) ORDER BY i.created_at)
      FROM public.wht_certificate_items i
      WHERE i.certificate_id = c.id
    ), '[]'::jsonb)
  ) INTO result
  FROM public.wht_certificates c
  WHERE c.id = p_cert_id AND c.status = 'completed';

  RETURN result;
END;
$$;