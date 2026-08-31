CREATE OR REPLACE FUNCTION public.check_equipe_hierarquia_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_supervisor_setor_id uuid;
  v_lider_setor_id uuid;
  v_lider_supervisor_id uuid;
BEGIN
  IF NEW.supervisor_id IS NOT NULL THEN
    SELECT setor_id INTO v_supervisor_setor_id
    FROM public.supervisores
    WHERE id = NEW.supervisor_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Supervisor ID % não encontrado', NEW.supervisor_id;
    END IF;

    IF v_supervisor_setor_id IS DISTINCT FROM NEW.setor_id THEN
      RAISE EXCEPTION 'Supervisor selecionado não pertence ao setor da equipe';
    END IF;
  END IF;

  IF NEW.leader_id IS NOT NULL THEN
    IF NEW.supervisor_id IS NULL THEN
      RAISE EXCEPTION 'Uma equipe com líder deve possuir supervisor';
    END IF;

    SELECT setor_id, supervisor_id
      INTO v_lider_setor_id, v_lider_supervisor_id
    FROM public.lideres_estrutura
    WHERE id = NEW.leader_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Líder ID % não encontrado', NEW.leader_id;
    END IF;

    IF v_lider_setor_id IS DISTINCT FROM NEW.setor_id THEN
      RAISE EXCEPTION 'Líder selecionado não pertence ao setor da equipe';
    END IF;

    IF v_lider_supervisor_id IS DISTINCT FROM NEW.supervisor_id THEN
      RAISE EXCEPTION 'Líder selecionado não pertence ao supervisor da equipe';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_equipe_hierarquia_integrity ON public.equipes;
CREATE TRIGGER trg_check_equipe_hierarquia_integrity
BEFORE INSERT OR UPDATE OF setor_id, supervisor_id, leader_id
ON public.equipes
FOR EACH ROW
EXECUTE FUNCTION public.check_equipe_hierarquia_integrity();

REVOKE ALL ON FUNCTION public.check_equipe_hierarquia_integrity() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_equipe_hierarquia_integrity() TO service_role;
