DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typnamespace = 'public'::regnamespace AND typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('admin', 'leader', 'user');
  END IF;
END $$;

ALTER TABLE public.equipes
  ADD COLUMN IF NOT EXISTS setor_id uuid,
  ADD COLUMN IF NOT EXISTS is_test boolean DEFAULT false;

ALTER TABLE public.servicos
  ADD COLUMN IF NOT EXISTS lat double precision,
  ADD COLUMN IF NOT EXISTS lng double precision,
  ADD COLUMN IF NOT EXISTS accuracy_m double precision,
  ADD COLUMN IF NOT EXISTS captured_at timestamptz;

CREATE TABLE IF NOT EXISTS public.setores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  supervisor_nome text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.setores TO anon;
GRANT SELECT ON public.setores TO authenticated;
GRANT ALL ON public.setores TO service_role;
ALTER TABLE public.setores ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.active_sessions (
  user_id uuid PRIMARY KEY,
  session_id text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.active_sessions TO authenticated;
GRANT ALL ON public.active_sessions TO service_role;
ALTER TABLE public.active_sessions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.google_form_settings (
  id text PRIMARY KEY DEFAULT 'singleton',
  mode text NOT NULL DEFAULT 'prod' CHECK (mode IN ('prod', 'test')),
  prod_form_id text NOT NULL DEFAULT '',
  test_form_id text NOT NULL DEFAULT '',
  prod_entries jsonb NOT NULL DEFAULT '{}'::jsonb,
  test_entries jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT google_form_settings_singleton CHECK (id = 'singleton')
);
GRANT SELECT ON public.google_form_settings TO anon;
GRANT SELECT ON public.google_form_settings TO authenticated;
GRANT ALL ON public.google_form_settings TO service_role;
ALTER TABLE public.google_form_settings ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.audit_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  duration_ms integer NOT NULL DEFAULT 0,
  overall_score integer NOT NULL DEFAULT 0,
  counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  report jsonb NOT NULL DEFAULT '{}'::jsonb
);
GRANT ALL ON public.audit_reports TO service_role;
ALTER TABLE public.audit_reports ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_equipes_setor_id ON public.equipes(setor_id);
CREATE INDEX IF NOT EXISTS idx_equipes_is_test ON public.equipes(is_test);
CREATE INDEX IF NOT EXISTS idx_servicos_geo ON public.servicos(lat, lng) WHERE lat IS NOT NULL AND lng IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_servicos_created_team ON public.servicos(created_at, team_id);
CREATE INDEX IF NOT EXISTS idx_expedientes_started_team ON public.expedientes(started_at, team_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_active_sessions_updated_at ON public.active_sessions(updated_at);
CREATE INDEX IF NOT EXISTS idx_audit_reports_created_at ON public.audit_reports(created_at DESC);

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_setores_updated_at ON public.setores;
CREATE TRIGGER touch_setores_updated_at
BEFORE UPDATE ON public.setores
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'setores' AND policyname = 'Setores are readable') THEN
    CREATE POLICY "Setores are readable" ON public.setores FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_roles' AND policyname = 'Users can read their own roles') THEN
    CREATE POLICY "Users can read their own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'active_sessions' AND policyname = 'Users manage their own active session') THEN
    CREATE POLICY "Users manage their own active session" ON public.active_sessions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'google_form_settings' AND policyname = 'Google form settings are readable') THEN
    CREATE POLICY "Google form settings are readable" ON public.google_form_settings FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'audit_reports' AND policyname = 'No direct audit report access') THEN
    CREATE POLICY "No direct audit report access" ON public.audit_reports FOR SELECT USING (false);
  END IF;
END $$;

INSERT INTO public.google_form_settings (id)
VALUES ('singleton')
ON CONFLICT (id) DO NOTHING;

UPDATE public.equipes SET is_test = false WHERE is_test IS NULL;

DO $$
DECLARE
  v_admin uuid;
BEGIN
  SELECT id INTO v_admin FROM public.equipes WHERE team_name ILIKE 'adm' OR team_name ILIKE 'administrador' LIMIT 1;
  IF v_admin IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_admin, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
END $$;