-- 1. Adiciona coluna deleted_at
ALTER TABLE public.expedientes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.servicos ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.complementos_servico ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.vinculos_complementos ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.impactos_expediente ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 2. Índices parciais para reads rápidos
CREATE INDEX IF NOT EXISTS idx_expedientes_active ON public.expedientes (team_id, started_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_servicos_active ON public.servicos (team_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_servicos_shift_active ON public.servicos (shift_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_vinculos_active ON public.vinculos_complementos (service_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_impactos_exp_active ON public.impactos_expediente (shift_id) WHERE deleted_at IS NULL;

-- Índices para lixeira (admin)
CREATE INDEX IF NOT EXISTS idx_expedientes_trash ON public.expedientes (deleted_at DESC) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_servicos_trash ON public.servicos (deleted_at DESC) WHERE deleted_at IS NOT NULL;

-- 3. Recria políticas RLS para esconder registros da lixeira dos usuários finais.
--    O admin usa service_role (bypassa RLS) — continua vendo tudo, inclusive lixeira.

-- expedientes
DROP POLICY IF EXISTS "sh_team_all" ON public.expedientes;
DROP POLICY IF EXISTS "Leaders read all expedientes" ON public.expedientes;
CREATE POLICY "sh_team_select" ON public.expedientes FOR SELECT
  USING (team_id = auth.uid() AND deleted_at IS NULL);
CREATE POLICY "sh_team_insert" ON public.expedientes FOR INSERT
  WITH CHECK (team_id = auth.uid());
CREATE POLICY "sh_team_update" ON public.expedientes FOR UPDATE
  USING (team_id = auth.uid() AND deleted_at IS NULL)
  WITH CHECK (team_id = auth.uid());
CREATE POLICY "sh_team_delete" ON public.expedientes FOR DELETE
  USING (team_id = auth.uid());
CREATE POLICY "Leaders read active expedientes" ON public.expedientes FOR SELECT
  USING (has_role(auth.uid(), 'leader'::app_role) AND deleted_at IS NULL);

-- servicos
DROP POLICY IF EXISTS "sv_team_all" ON public.servicos;
DROP POLICY IF EXISTS "Leaders read all servicos" ON public.servicos;
CREATE POLICY "sv_team_select" ON public.servicos FOR SELECT
  USING (team_id = auth.uid() AND deleted_at IS NULL);
CREATE POLICY "sv_team_insert" ON public.servicos FOR INSERT
  WITH CHECK (team_id = auth.uid());
CREATE POLICY "sv_team_update" ON public.servicos FOR UPDATE
  USING (team_id = auth.uid() AND deleted_at IS NULL)
  WITH CHECK (team_id = auth.uid());
CREATE POLICY "sv_team_delete" ON public.servicos FOR DELETE
  USING (team_id = auth.uid());
CREATE POLICY "Leaders read active servicos" ON public.servicos FOR SELECT
  USING (has_role(auth.uid(), 'leader'::app_role) AND deleted_at IS NULL);

-- vinculos_complementos
DROP POLICY IF EXISTS "scl_team_all" ON public.vinculos_complementos;
DROP POLICY IF EXISTS "Leaders read all vinculos_complementos" ON public.vinculos_complementos;
CREATE POLICY "scl_team_select" ON public.vinculos_complementos FOR SELECT
  USING (team_id = auth.uid() AND deleted_at IS NULL);
CREATE POLICY "scl_team_insert" ON public.vinculos_complementos FOR INSERT
  WITH CHECK (team_id = auth.uid());
CREATE POLICY "scl_team_update" ON public.vinculos_complementos FOR UPDATE
  USING (team_id = auth.uid() AND deleted_at IS NULL)
  WITH CHECK (team_id = auth.uid());
CREATE POLICY "scl_team_delete" ON public.vinculos_complementos FOR DELETE
  USING (team_id = auth.uid());
CREATE POLICY "Leaders read active vinculos" ON public.vinculos_complementos FOR SELECT
  USING (has_role(auth.uid(), 'leader'::app_role) AND deleted_at IS NULL);

-- impactos_expediente
DROP POLICY IF EXISTS "si_team_all" ON public.impactos_expediente;
DROP POLICY IF EXISTS "Leaders read all impactos_expediente" ON public.impactos_expediente;
CREATE POLICY "si_team_select" ON public.impactos_expediente FOR SELECT
  USING (team_id = auth.uid() AND deleted_at IS NULL);
CREATE POLICY "si_team_insert" ON public.impactos_expediente FOR INSERT
  WITH CHECK (team_id = auth.uid());
CREATE POLICY "si_team_update" ON public.impactos_expediente FOR UPDATE
  USING (team_id = auth.uid() AND deleted_at IS NULL)
  WITH CHECK (team_id = auth.uid());
CREATE POLICY "si_team_delete" ON public.impactos_expediente FOR DELETE
  USING (team_id = auth.uid());
CREATE POLICY "Leaders read active impactos" ON public.impactos_expediente FOR SELECT
  USING (has_role(auth.uid(), 'leader'::app_role) AND deleted_at IS NULL);

-- complementos_servico (catálogo global)
DROP POLICY IF EXISTS "sc_read_all" ON public.complementos_servico;
CREATE POLICY "sc_read_active" ON public.complementos_servico FOR SELECT
  USING (deleted_at IS NULL);