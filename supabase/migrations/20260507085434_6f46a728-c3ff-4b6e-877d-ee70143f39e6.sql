CREATE OR REPLACE FUNCTION public.link_staff_line_id(
  p_owner uuid,
  p_phone text,
  p_line_user_id text,
  p_staff_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_normalized_phone text;
  v_count int;
  v_target record;
  v_existing record;
  v_candidates jsonb;
BEGIN
  IF p_owner IS NULL OR NOT public.is_valid_user_id(p_owner) THEN
    RETURN jsonb_build_object('status', 'invalid_owner');
  END IF;

  v_normalized_phone := regexp_replace(COALESCE(p_phone, ''), '[^0-9]', '', 'g');

  IF p_line_user_id IS NOT NULL AND length(trim(p_line_user_id)) > 0 THEN
    SELECT id, staff_name, nickname INTO v_existing
    FROM public.staff_profiles
    WHERE user_id = p_owner AND line_user_id = p_line_user_id
    LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'status', 'already_linked',
        'profile', jsonb_build_object(
          'id', v_existing.id,
          'staff_name', v_existing.staff_name,
          'nickname', v_existing.nickname
        )
      );
    END IF;
  END IF;

  IF p_staff_id IS NOT NULL THEN
    SELECT id, staff_name, nickname INTO v_target
    FROM public.staff_profiles
    WHERE id = p_staff_id AND user_id = p_owner AND line_user_id IS NULL
    LIMIT 1;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('status', 'not_found');
    END IF;

    IF p_line_user_id IS NULL OR length(trim(p_line_user_id)) = 0 THEN
      RETURN jsonb_build_object(
        'status', 'needs_line_login',
        'profile', jsonb_build_object(
          'id', v_target.id,
          'staff_name', v_target.staff_name,
          'nickname', v_target.nickname
        )
      );
    END IF;

    UPDATE public.staff_profiles SET line_user_id = p_line_user_id WHERE id = v_target.id;

    RETURN jsonb_build_object(
      'status', 'linked',
      'profile', jsonb_build_object(
        'id', v_target.id,
        'staff_name', v_target.staff_name,
        'nickname', v_target.nickname
      )
    );
  END IF;

  IF length(v_normalized_phone) < 9 THEN
    RETURN jsonb_build_object('status', 'invalid_phone');
  END IF;

  SELECT count(*) INTO v_count
  FROM public.staff_profiles
  WHERE user_id = p_owner
    AND line_user_id IS NULL
    AND regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g') = v_normalized_phone;

  IF v_count = 0 THEN
    RETURN jsonb_build_object('status', 'not_found');
  ELSIF v_count = 1 THEN
    SELECT id, staff_name, nickname INTO v_target
    FROM public.staff_profiles
    WHERE user_id = p_owner
      AND line_user_id IS NULL
      AND regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g') = v_normalized_phone
    LIMIT 1;

    IF p_line_user_id IS NULL OR length(trim(p_line_user_id)) = 0 THEN
      RETURN jsonb_build_object(
        'status', 'needs_line_login',
        'profile', jsonb_build_object(
          'id', v_target.id,
          'staff_name', v_target.staff_name,
          'nickname', v_target.nickname
        )
      );
    END IF;

    UPDATE public.staff_profiles SET line_user_id = p_line_user_id WHERE id = v_target.id;

    RETURN jsonb_build_object(
      'status', 'linked',
      'profile', jsonb_build_object(
        'id', v_target.id,
        'staff_name', v_target.staff_name,
        'nickname', v_target.nickname
      )
    );
  ELSE
    SELECT jsonb_agg(jsonb_build_object('id', id, 'staff_name', staff_name, 'nickname', nickname))
    INTO v_candidates
    FROM public.staff_profiles
    WHERE user_id = p_owner
      AND line_user_id IS NULL
      AND regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g') = v_normalized_phone;

    RETURN jsonb_build_object('status', 'multiple', 'candidates', v_candidates);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.link_vendor_line_id(
  p_owner uuid,
  p_phone text,
  p_tax_id text,
  p_line_user_id text,
  p_vendor_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_normalized_phone text;
  v_normalized_tax text;
  v_count int;
  v_target record;
  v_existing record;
  v_candidates jsonb;
BEGIN
  IF p_owner IS NULL OR NOT public.is_valid_user_id(p_owner) THEN
    RETURN jsonb_build_object('status', 'invalid_owner');
  END IF;

  v_normalized_phone := regexp_replace(COALESCE(p_phone, ''), '[^0-9]', '', 'g');
  v_normalized_tax := regexp_replace(COALESCE(p_tax_id, ''), '[^0-9]', '', 'g');

  IF p_line_user_id IS NOT NULL AND length(trim(p_line_user_id)) > 0 THEN
    SELECT id, company_name INTO v_existing
    FROM public.vendor_profiles
    WHERE user_id = p_owner AND line_user_id = p_line_user_id
    LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'status', 'already_linked',
        'profile', jsonb_build_object('id', v_existing.id, 'company_name', v_existing.company_name)
      );
    END IF;
  END IF;

  IF p_vendor_id IS NOT NULL THEN
    SELECT id, company_name INTO v_target
    FROM public.vendor_profiles
    WHERE id = p_vendor_id AND user_id = p_owner AND line_user_id IS NULL
    LIMIT 1;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('status', 'not_found');
    END IF;

    IF p_line_user_id IS NULL OR length(trim(p_line_user_id)) = 0 THEN
      RETURN jsonb_build_object(
        'status', 'needs_line_login',
        'profile', jsonb_build_object('id', v_target.id, 'company_name', v_target.company_name)
      );
    END IF;

    UPDATE public.vendor_profiles SET line_user_id = p_line_user_id WHERE id = v_target.id;
    RETURN jsonb_build_object(
      'status', 'linked',
      'profile', jsonb_build_object('id', v_target.id, 'company_name', v_target.company_name)
    );
  END IF;

  IF length(v_normalized_tax) >= 10 THEN
    SELECT count(*) INTO v_count
    FROM public.vendor_profiles
    WHERE user_id = p_owner AND line_user_id IS NULL
      AND regexp_replace(COALESCE(tax_id, ''), '[^0-9]', '', 'g') = v_normalized_tax;

    IF v_count = 1 THEN
      SELECT id, company_name INTO v_target
      FROM public.vendor_profiles
      WHERE user_id = p_owner AND line_user_id IS NULL
        AND regexp_replace(COALESCE(tax_id, ''), '[^0-9]', '', 'g') = v_normalized_tax
      LIMIT 1;

      IF p_line_user_id IS NULL OR length(trim(p_line_user_id)) = 0 THEN
        RETURN jsonb_build_object(
          'status', 'needs_line_login',
          'profile', jsonb_build_object('id', v_target.id, 'company_name', v_target.company_name)
        );
      END IF;

      UPDATE public.vendor_profiles SET line_user_id = p_line_user_id WHERE id = v_target.id;
      RETURN jsonb_build_object(
        'status', 'linked',
        'profile', jsonb_build_object('id', v_target.id, 'company_name', v_target.company_name)
      );
    ELSIF v_count > 1 THEN
      SELECT jsonb_agg(jsonb_build_object('id', id, 'company_name', company_name))
      INTO v_candidates
      FROM public.vendor_profiles
      WHERE user_id = p_owner AND line_user_id IS NULL
        AND regexp_replace(COALESCE(tax_id, ''), '[^0-9]', '', 'g') = v_normalized_tax;
      RETURN jsonb_build_object('status', 'multiple', 'candidates', v_candidates);
    END IF;
  END IF;

  IF length(v_normalized_phone) >= 9 THEN
    SELECT count(*) INTO v_count
    FROM public.vendor_profiles
    WHERE user_id = p_owner AND line_user_id IS NULL
      AND regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g') = v_normalized_phone;

    IF v_count = 1 THEN
      SELECT id, company_name INTO v_target
      FROM public.vendor_profiles
      WHERE user_id = p_owner AND line_user_id IS NULL
        AND regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g') = v_normalized_phone
      LIMIT 1;

      IF p_line_user_id IS NULL OR length(trim(p_line_user_id)) = 0 THEN
        RETURN jsonb_build_object(
          'status', 'needs_line_login',
          'profile', jsonb_build_object('id', v_target.id, 'company_name', v_target.company_name)
        );
      END IF;

      UPDATE public.vendor_profiles SET line_user_id = p_line_user_id WHERE id = v_target.id;
      RETURN jsonb_build_object(
        'status', 'linked',
        'profile', jsonb_build_object('id', v_target.id, 'company_name', v_target.company_name)
      );
    ELSIF v_count > 1 THEN
      SELECT jsonb_agg(jsonb_build_object('id', id, 'company_name', company_name))
      INTO v_candidates
      FROM public.vendor_profiles
      WHERE user_id = p_owner AND line_user_id IS NULL
        AND regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g') = v_normalized_phone;
      RETURN jsonb_build_object('status', 'multiple', 'candidates', v_candidates);
    END IF;
  END IF;

  RETURN jsonb_build_object('status', 'not_found');
END;
$$;

GRANT EXECUTE ON FUNCTION public.link_staff_line_id(uuid, text, text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.link_vendor_line_id(uuid, text, text, text, uuid) TO anon, authenticated;