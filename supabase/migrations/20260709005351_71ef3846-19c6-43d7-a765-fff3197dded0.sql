CREATE OR REPLACE FUNCTION public.ensure_expediente_before_service()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.shift_id IS NULL OR NEW.team_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NOT NULL AND NEW.team_id <> auth.uid() THEN
    RAISE EXCEPTION 'Equipe do serviço não corresponde ao usuário autenticado'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.expedientes (
    id,
    team_id,
    started_at,
    ended_at,
    status,
    report_text,
    variable_rate_snapshot
  )
  VALUES (
    NEW.shift_id,
    NEW.team_id,
    COALESCE(NEW.captured_at, NEW.created_at, now()),
    NULL,
    'open',
    NULL,
    NULL
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ensure_expediente_before_service_insert ON public.servicos;
CREATE TRIGGER ensure_expediente_before_service_insert
BEFORE INSERT OR UPDATE OF shift_id, team_id ON public.servicos
FOR EACH ROW
EXECUTE FUNCTION public.ensure_expediente_before_service();