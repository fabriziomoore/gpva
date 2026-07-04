
CREATE OR REPLACE FUNCTION public.handle_new_team()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_team_name text;
BEGIN
  IF COALESCE(NEW.raw_user_meta_data->>'is_admin', 'false') = 'true' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.raw_user_meta_data->>'is_leader', 'false') = 'true' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'leader'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
    RETURN NEW;
  END IF;

  v_team_name := COALESCE(NEW.raw_user_meta_data->>'team_name', split_part(NEW.email, '@', 1));
  INSERT INTO public.equipes (id, team_name) VALUES (NEW.id, v_team_name);
  RETURN NEW;
END;
$function$;
