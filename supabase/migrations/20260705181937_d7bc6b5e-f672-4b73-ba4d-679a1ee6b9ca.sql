CREATE OR REPLACE FUNCTION public.handle_new_team()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_team_name text;
  v_setor_id uuid;
  v_is_admin boolean;
BEGIN
  v_is_admin := COALESCE((NEW.raw_user_meta_data->>'is_admin')::boolean, false)
    OR lower(NEW.email) = 'adm@gpva.local';

  IF v_is_admin THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
    RETURN NEW;
  END IF;

  v_team_name := COALESCE(NEW.raw_user_meta_data->>'team_name', split_part(NEW.email, '@', 1));
  SELECT id INTO v_setor_id FROM public.setores ORDER BY created_at LIMIT 1;
  IF v_setor_id IS NULL THEN
    INSERT INTO public.setores (nome, supervisor_nome) VALUES ('Administração', '') RETURNING id INTO v_setor_id;
  END IF;
  INSERT INTO public.equipes (id, team_name, setor_id) VALUES (NEW.id, v_team_name, v_setor_id)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$function$;