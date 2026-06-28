
CREATE TABLE public.service_complements (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id uuid NOT NULL,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_complements TO authenticated;
GRANT ALL ON public.service_complements TO service_role;
ALTER TABLE public.service_complements ENABLE ROW LEVEL SECURITY;
CREATE POLICY sc_team_all ON public.service_complements
  FOR ALL TO authenticated
  USING (team_id = auth.uid()) WITH CHECK (team_id = auth.uid());

CREATE TABLE public.service_complement_links (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id uuid NOT NULL,
  shift_id uuid NOT NULL,
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  complement_id uuid,
  complement_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_complement_links TO authenticated;
GRANT ALL ON public.service_complement_links TO service_role;
ALTER TABLE public.service_complement_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY scl_team_all ON public.service_complement_links
  FOR ALL TO authenticated
  USING (team_id = auth.uid()) WITH CHECK (team_id = auth.uid());
CREATE INDEX scl_service_idx ON public.service_complement_links(service_id);
CREATE INDEX scl_team_name_idx ON public.service_complement_links(team_id, complement_name);

-- shift_impacts: replace composite PK with surrogate id so impact_id can be NULL (custom "Outros")
ALTER TABLE public.shift_impacts DROP CONSTRAINT shift_impacts_pkey;
ALTER TABLE public.shift_impacts ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY;
ALTER TABLE public.shift_impacts ALTER COLUMN impact_id DROP NOT NULL;

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

  INSERT INTO public.teams (id, team_name) VALUES (NEW.id, v_team_name);

  INSERT INTO public.service_types (team_id, name, is_negotiation, sort_order) VALUES
    (NEW.id, 'Corte Cavalete', false, 1),
    (NEW.id, 'Corte Ramal', false, 2),
    (NEW.id, 'Religação', false, 3),
    (NEW.id, 'Negociação', true, 4),
    (NEW.id, 'Fiscalização', false, 5),
    (NEW.id, 'Revisita', false, 6);

  INSERT INTO public.inviability_reasons (team_id, name) VALUES
    (NEW.id, 'Área de risco'),
    (NEW.id, 'Ligação inexistente'),
    (NEW.id, 'Ramal não localizado'),
    (NEW.id, 'Suspenso'),
    (NEW.id, 'Cliente ausente'),
    (NEW.id, 'Imóvel fechado');

  INSERT INTO public.impacts (team_id, name) VALUES
    (NEW.id, 'Condições climáticas'),
    (NEW.id, 'Área de risco'),
    (NEW.id, 'Cliente agressivo'),
    (NEW.id, 'Apoio policial'),
    (NEW.id, 'Veículo quebrado'),
    (NEW.id, 'Falta de material');

  INSERT INTO public.service_complements (team_id, name, sort_order) VALUES
    (NEW.id, 'Substituição de HD', 1),
    (NEW.id, 'Lavagem de Rede', 2),
    (NEW.id, 'Apoio', 3),
    (NEW.id, 'Retorno', 4),
    (NEW.id, 'Vistoria', 5),
    (NEW.id, 'Outros', 6);

  RETURN NEW;
END;
$function$;

INSERT INTO public.service_complements (team_id, name, sort_order)
SELECT t.id, c.name, c.ord
FROM public.teams t
CROSS JOIN (VALUES
  ('Substituição de HD', 1),
  ('Lavagem de Rede', 2),
  ('Apoio', 3),
  ('Retorno', 4),
  ('Vistoria', 5),
  ('Outros', 6)
) AS c(name, ord)
WHERE NOT EXISTS (
  SELECT 1 FROM public.service_complements sc WHERE sc.team_id = t.id
);
