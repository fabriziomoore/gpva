-- 1) Remove órfãos em active_sessions
DELETE FROM public.active_sessions s
WHERE NOT EXISTS (SELECT 1 FROM public.equipes e WHERE e.id = s.user_id);

-- 2) Adiciona FK com CASCADE (drop se já existir)
ALTER TABLE public.active_sessions
  DROP CONSTRAINT IF EXISTS active_sessions_user_id_fkey;
ALTER TABLE public.active_sessions
  ADD CONSTRAINT active_sessions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.equipes(id) ON DELETE CASCADE;

-- 3) Normaliza coordenadas (0,0) para NULL
UPDATE public.servicos
SET lat = NULL, lng = NULL
WHERE lat = 0 AND lng = 0;

-- 4) Trigger para bloquear (0,0) em novos inserts/updates
CREATE OR REPLACE FUNCTION public.reject_zero_coords()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.lat = 0 AND NEW.lng = 0 THEN
    NEW.lat := NULL;
    NEW.lng := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS servicos_reject_zero_coords ON public.servicos;
CREATE TRIGGER servicos_reject_zero_coords
  BEFORE INSERT OR UPDATE OF lat, lng ON public.servicos
  FOR EACH ROW EXECUTE FUNCTION public.reject_zero_coords();