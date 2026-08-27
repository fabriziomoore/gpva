CREATE OR REPLACE FUNCTION public.operational_visible_team_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id
  FROM public.equipes e
  WHERE auth.uid() IS NOT NULL
    AND (
      e.id = auth.uid()
      OR e.supervisor_id IN (SELECT s.id FROM public.supervisores s WHERE s.user_id = auth.uid())
      OR e.leader_id IN (SELECT l.id FROM public.lideres_estrutura l WHERE l.user_id = auth.uid())
    );
$$;

REVOKE ALL ON FUNCTION public.operational_visible_team_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.operational_visible_team_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.operational_visible_team_ids() TO service_role;

-- Remover policies legadas de leitura global do líder
DROP POLICY IF EXISTS "Leaders read all equipes" ON public.equipes;
DROP POLICY IF EXISTS "Leaders read active expedientes" ON public.expedientes;
DROP POLICY IF EXISTS "Leaders read active servicos" ON public.servicos;
DROP POLICY IF EXISTS "Leaders read active impactos" ON public.impactos_expediente;
DROP POLICY IF EXISTS "Leaders read active vinculos" ON public.vinculos_complementos;

-- Novas policies de leitura por árvore operacional (SOMENTE SELECT)
DROP POLICY IF EXISTS "op_hierarchy_select" ON public.equipes;
CREATE POLICY "op_hierarchy_select" ON public.equipes
  FOR SELECT TO authenticated
  USING (id IN (SELECT public.operational_visible_team_ids()));

DROP POLICY IF EXISTS "op_hierarchy_select" ON public.expedientes;
CREATE POLICY "op_hierarchy_select" ON public.expedientes
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND team_id IN (SELECT public.operational_visible_team_ids()));

DROP POLICY IF EXISTS "op_hierarchy_select" ON public.servicos;
CREATE POLICY "op_hierarchy_select" ON public.servicos
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND team_id IN (SELECT public.operational_visible_team_ids()));

DROP POLICY IF EXISTS "op_hierarchy_select" ON public.impactos_expediente;
CREATE POLICY "op_hierarchy_select" ON public.impactos_expediente
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND team_id IN (SELECT public.operational_visible_team_ids()));

DROP POLICY IF EXISTS "op_hierarchy_select" ON public.vinculos_complementos;
CREATE POLICY "op_hierarchy_select" ON public.vinculos_complementos
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND team_id IN (SELECT public.operational_visible_team_ids()));