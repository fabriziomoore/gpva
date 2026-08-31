-- ACP / GPVA — checkpoint da migração para Supabase próprio
-- Destino: zerepuiyqbenogeyllxb
--
-- Esta migration documenta invariantes estruturais consolidados durante a migração.
-- Ela é deliberadamente idempotente e NÃO contém dados de usuários/equipes do banco antigo.
-- Auth e dados operacionais serão migrados separadamente preservando UUIDs.

-- Enums finais
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('leader', 'admin', 'supervisor');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Roles de aplicação
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;

-- Índices de FKs relevantes
CREATE INDEX IF NOT EXISTS idx_impactos_expediente_impact_id ON public.impactos_expediente(impact_id);
CREATE INDEX IF NOT EXISTS idx_procedimento_versoes_criado_por_id ON public.procedimento_versoes(criado_por_id);
CREATE INDEX IF NOT EXISTS idx_procedimento_versoes_publicado_por_id ON public.procedimento_versoes(publicado_por_id);
CREATE INDEX IF NOT EXISTS idx_procedimento_versoes_status_alterado_por_id ON public.procedimento_versoes(status_alterado_por_id);
CREATE INDEX IF NOT EXISTS idx_procedimento_versoes_substitui_versao_id ON public.procedimento_versoes(substitui_versao_id);
CREATE INDEX IF NOT EXISTS idx_procedimentos_responsavel_id ON public.procedimentos(responsavel_id);
CREATE INDEX IF NOT EXISTS idx_servicos_reason_id ON public.servicos(reason_id);
CREATE INDEX IF NOT EXISTS idx_servicos_service_type_id ON public.servicos(service_type_id);
CREATE INDEX IF NOT EXISTS idx_setores_supervisor_user_id ON public.setores(supervisor_user_id);

-- Defaults necessários para compatibilidade com o frontend atual
ALTER TABLE public.google_form_settings
  ALTER COLUMN prod_form_id SET DEFAULT '',
  ALTER COLUMN test_form_id SET DEFAULT '',
  ALTER COLUMN prod_entries SET DEFAULT '{}'::jsonb,
  ALTER COLUMN test_entries SET DEFAULT '{}'::jsonb;

ALTER TABLE public.audit_reports
  ALTER COLUMN duration_ms SET DEFAULT 0,
  ALTER COLUMN overall_score SET DEFAULT 0,
  ALTER COLUMN report SET DEFAULT '{}'::jsonb;

-- Funções usadas somente por trigger não devem ser expostas como RPC.
DO $$ BEGIN
  REVOKE ALL ON FUNCTION public.check_lider_estrutura_integrity() FROM PUBLIC, anon, authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;
DO $$ BEGIN
  REVOKE ALL ON FUNCTION public.prevent_procedimento_versao_historical_delete() FROM PUBLIC, anon, authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;
DO $$ BEGIN
  REVOKE ALL ON FUNCTION public.trg_enforce_versao_immutability() FROM PUBLIC, anon, authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- Observações de migração:
-- 1. O setor canônico "Corte e Religa" deve manter o UUID histórico
--    16bbd6c9-0469-40b0-95c8-a2909e7312c1 durante a carga de dados.
-- 2. Não inserir UUIDs de usuários/equipes nesta migration.
-- 3. Fotos de equipe são persistidas em equipes.photo_url como Data URL; Storage não é obrigatório para esse fluxo.
-- 4. A Edge Function admin-api só deve ser implantada após remover senha hardcoded e configurar ACP_ADMIN_PASSWORD como secret server-side.
