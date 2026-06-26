
-- Teams (one per auth.user)
CREATE TABLE public.teams (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  team_name text UNIQUE NOT NULL,
  supervisor text NOT NULL DEFAULT '',
  leader text NOT NULL DEFAULT '',
  variable_rate numeric NOT NULL DEFAULT 7.00,
  onboarded boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teams TO authenticated;
GRANT ALL ON public.teams TO service_role;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team_own_select" ON public.teams FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "team_own_update" ON public.teams FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- Service types
CREATE TABLE public.service_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_negotiation boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX service_types_team_idx ON public.service_types(team_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_types TO authenticated;
GRANT ALL ON public.service_types TO service_role;
ALTER TABLE public.service_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "st_team_all" ON public.service_types FOR ALL TO authenticated USING (team_id = auth.uid()) WITH CHECK (team_id = auth.uid());

-- Inviability reasons
CREATE TABLE public.inviability_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inviability_reasons_team_idx ON public.inviability_reasons(team_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inviability_reasons TO authenticated;
GRANT ALL ON public.inviability_reasons TO service_role;
ALTER TABLE public.inviability_reasons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ir_team_all" ON public.inviability_reasons FOR ALL TO authenticated USING (team_id = auth.uid()) WITH CHECK (team_id = auth.uid());

-- Impacts
CREATE TABLE public.impacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX impacts_team_idx ON public.impacts(team_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.impacts TO authenticated;
GRANT ALL ON public.impacts TO service_role;
ALTER TABLE public.impacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "im_team_all" ON public.impacts FOR ALL TO authenticated USING (team_id = auth.uid()) WITH CHECK (team_id = auth.uid());

-- Shifts
CREATE TABLE public.shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  status text NOT NULL DEFAULT 'open',
  variable_rate_snapshot numeric,
  report_text text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX shifts_team_idx ON public.shifts(team_id, started_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shifts TO authenticated;
GRANT ALL ON public.shifts TO service_role;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sh_team_all" ON public.shifts FOR ALL TO authenticated USING (team_id = auth.uid()) WITH CHECK (team_id = auth.uid());

-- Services
CREATE TABLE public.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  shift_id uuid NOT NULL REFERENCES public.shifts(id) ON DELETE CASCADE,
  service_type_id uuid REFERENCES public.service_types(id) ON DELETE SET NULL,
  service_type_name text NOT NULL,
  is_negotiation boolean NOT NULL DEFAULT false,
  viable boolean NOT NULL DEFAULT true,
  reason_id uuid REFERENCES public.inviability_reasons(id) ON DELETE SET NULL,
  reason_name text,
  registration_number text,
  negotiated_value numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX services_team_idx ON public.services(team_id, created_at DESC);
CREATE INDEX services_shift_idx ON public.services(shift_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.services TO authenticated;
GRANT ALL ON public.services TO service_role;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sv_team_all" ON public.services FOR ALL TO authenticated USING (team_id = auth.uid()) WITH CHECK (team_id = auth.uid());

-- Shift impacts (N:N)
CREATE TABLE public.shift_impacts (
  shift_id uuid NOT NULL REFERENCES public.shifts(id) ON DELETE CASCADE,
  impact_id uuid NOT NULL REFERENCES public.impacts(id) ON DELETE CASCADE,
  impact_name text NOT NULL,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  PRIMARY KEY (shift_id, impact_id)
);
CREATE INDEX shift_impacts_team_idx ON public.shift_impacts(team_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shift_impacts TO authenticated;
GRANT ALL ON public.shift_impacts TO service_role;
ALTER TABLE public.shift_impacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "si_team_all" ON public.shift_impacts FOR ALL TO authenticated USING (team_id = auth.uid()) WITH CHECK (team_id = auth.uid());

-- Trigger: on new auth.user, create team row + seed defaults
CREATE OR REPLACE FUNCTION public.handle_new_team()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_team();
