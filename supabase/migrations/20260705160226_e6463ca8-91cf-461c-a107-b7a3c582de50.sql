
-- Garante setor padrão
INSERT INTO public.setores (nome, supervisor_nome)
SELECT 'Administração', ''
WHERE NOT EXISTS (SELECT 1 FROM public.setores);

-- Atualiza o trigger para incluir setor padrão automaticamente
CREATE OR REPLACE FUNCTION public.handle_new_team()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team_name text;
  v_setor_id uuid;
BEGIN
  v_team_name := COALESCE(NEW.raw_user_meta_data->>'team_name', split_part(NEW.email, '@', 1));
  SELECT id INTO v_setor_id FROM public.setores ORDER BY created_at LIMIT 1;
  IF v_setor_id IS NULL THEN
    INSERT INTO public.setores (nome, supervisor_nome) VALUES ('Administração', '') RETURNING id INTO v_setor_id;
  END IF;
  INSERT INTO public.equipes (id, team_name, setor_id) VALUES (NEW.id, v_team_name, v_setor_id)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Remove admin do Gabriel
DELETE FROM public.user_roles
WHERE user_id = '6a17b5a5-6716-4af4-b567-743596b1a2c7' AND role = 'admin';

-- Cria o usuário adm
DO $$
DECLARE
  v_adm_id uuid;
BEGIN
  SELECT id INTO v_adm_id FROM auth.users WHERE email = 'adm@gpva.local';

  IF v_adm_id IS NULL THEN
    v_adm_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, aud, role, email,
      encrypted_password, email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data, is_super_admin, is_sso_user, is_anonymous
    ) VALUES (
      v_adm_id, '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated', 'adm@gpva.local',
      crypt('137889', gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('team_name','adm'),
      false, false, false
    );

    INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at, last_sign_in_at)
    VALUES (
      gen_random_uuid(), v_adm_id, v_adm_id::text,
      jsonb_build_object('sub', v_adm_id::text, 'email', 'adm@gpva.local'),
      'email', now(), now(), now()
    );
  ELSE
    UPDATE auth.users
    SET encrypted_password = crypt('137889', gen_salt('bf')),
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        updated_at = now()
    WHERE id = v_adm_id;
  END IF;

  UPDATE public.equipes SET team_name = 'adm' WHERE id = v_adm_id;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_adm_id, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;
END $$;
