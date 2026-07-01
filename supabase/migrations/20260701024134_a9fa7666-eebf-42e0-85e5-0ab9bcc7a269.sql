
-- 1) Relax FK on impactos_expediente.impact_id so removing per-team impact rows
--    doesn't cascade-delete historical shift impacts.
ALTER TABLE public.impactos_expediente
  DROP CONSTRAINT IF EXISTS shift_impacts_impact_id_fkey;
ALTER TABLE public.impactos_expediente
  ADD CONSTRAINT shift_impacts_impact_id_fkey
    FOREIGN KEY (impact_id) REFERENCES public.impactos(id) ON DELETE SET NULL;

-- 2) Ensure a global row (team_id IS NULL) exists for every distinct name.
INSERT INTO public.tipos_servico (team_id, name, is_negotiation, sort_order, active)
SELECT NULL, t.name, t.is_negotiation, t.sort_order, true
FROM (
  SELECT DISTINCT ON (lower(trim(name))) name, is_negotiation, sort_order
  FROM public.tipos_servico
  WHERE active = true
  ORDER BY lower(trim(name)), team_id NULLS FIRST
) t
WHERE NOT EXISTS (
  SELECT 1 FROM public.tipos_servico g
  WHERE g.team_id IS NULL AND lower(trim(g.name)) = lower(trim(t.name))
);

INSERT INTO public.motivos_inviabilidade (team_id, name, active)
SELECT NULL, t.name, true
FROM (
  SELECT DISTINCT ON (lower(trim(name))) name
  FROM public.motivos_inviabilidade
  WHERE active = true
  ORDER BY lower(trim(name)), team_id NULLS FIRST
) t
WHERE NOT EXISTS (
  SELECT 1 FROM public.motivos_inviabilidade g
  WHERE g.team_id IS NULL AND lower(trim(g.name)) = lower(trim(t.name))
);

INSERT INTO public.impactos (team_id, name, active)
SELECT NULL, t.name, true
FROM (
  SELECT DISTINCT ON (lower(trim(name))) name
  FROM public.impactos
  WHERE active = true
  ORDER BY lower(trim(name)), team_id NULLS FIRST
) t
WHERE NOT EXISTS (
  SELECT 1 FROM public.impactos g
  WHERE g.team_id IS NULL AND lower(trim(g.name)) = lower(trim(t.name))
);

INSERT INTO public.complementos_servico (team_id, name, sort_order, active)
SELECT NULL, t.name, t.sort_order, true
FROM (
  SELECT DISTINCT ON (lower(trim(name))) name, sort_order
  FROM public.complementos_servico
  WHERE active = true
  ORDER BY lower(trim(name)), team_id NULLS FIRST
) t
WHERE NOT EXISTS (
  SELECT 1 FROM public.complementos_servico g
  WHERE g.team_id IS NULL AND lower(trim(g.name)) = lower(trim(t.name))
);

-- 3) Drop per-team catalog rows. FKs are SET NULL / no FK, so history stays.
DELETE FROM public.tipos_servico         WHERE team_id IS NOT NULL;
DELETE FROM public.motivos_inviabilidade WHERE team_id IS NOT NULL;
DELETE FROM public.impactos              WHERE team_id IS NOT NULL;
DELETE FROM public.complementos_servico  WHERE team_id IS NOT NULL;

-- 4) Stop seeding per-team catalog rows for new teams.
CREATE OR REPLACE FUNCTION public.handle_new_team()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_team_name text;
BEGIN
  v_team_name := COALESCE(NEW.raw_user_meta_data->>'team_name', split_part(NEW.email, '@', 1));
  INSERT INTO public.equipes (id, team_name) VALUES (NEW.id, v_team_name);
  RETURN NEW;
END;
$function$;
