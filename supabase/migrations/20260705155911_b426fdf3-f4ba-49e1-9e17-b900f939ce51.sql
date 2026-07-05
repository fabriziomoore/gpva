
-- 1. Coluna is_test em equipes
ALTER TABLE public.equipes
  ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_equipes_is_test ON public.equipes(is_test);

-- 2. active_sessions
CREATE TABLE IF NOT EXISTS public.active_sessions (
  user_id uuid PRIMARY KEY,
  session_id text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.active_sessions TO authenticated;
GRANT ALL ON public.active_sessions TO service_role;
ALTER TABLE public.active_sessions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_active_sessions_updated_at ON public.active_sessions(updated_at);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='active_sessions' AND policyname='Users manage their own active session') THEN
    CREATE POLICY "Users manage their own active session" ON public.active_sessions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- 3. google_form_settings
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

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='google_form_settings' AND policyname='Google form settings are readable') THEN
    CREATE POLICY "Google form settings are readable" ON public.google_form_settings FOR SELECT USING (true);
  END IF;
END $$;

INSERT INTO public.google_form_settings (id) VALUES ('singleton') ON CONFLICT (id) DO NOTHING;

-- 4. audit_reports
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
CREATE INDEX IF NOT EXISTS idx_audit_reports_created_at ON public.audit_reports(created_at DESC);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='audit_reports' AND policyname='No direct audit report access') THEN
    CREATE POLICY "No direct audit report access" ON public.audit_reports FOR SELECT USING (false);
  END IF;
END $$;

-- 5. Concede admin ao Gabriel Aráujo (usuário que administra o app)
INSERT INTO public.user_roles (user_id, role)
VALUES ('6a17b5a5-6716-4af4-b567-743596b1a2c7', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;
