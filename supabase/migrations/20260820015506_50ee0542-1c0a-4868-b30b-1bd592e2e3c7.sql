
BEGIN;

-- Limpeza de políticas existentes
DROP POLICY IF EXISTS "Equipes veem publicados ativos" ON public.procedimento_versoes;
DROP POLICY IF EXISTS "Líderes e admins veem tudo" ON public.procedimento_versoes;
DROP POLICY IF EXISTS "Líderes e admins inserem drafts" ON public.procedimento_versoes;
DROP POLICY IF EXISTS "Líderes e admins editam drafts" ON public.procedimento_versoes;
DROP POLICY IF EXISTS "Líderes e admins atualizam status histórico" ON public.procedimento_versoes;
DROP POLICY IF EXISTS "Líderes e admins deletam drafts" ON public.procedimento_versoes;
DROP POLICY IF EXISTS "canonical_versoes_select" ON public.procedimento_versoes;
DROP POLICY IF EXISTS "canonical_versoes_insert_draft" ON public.procedimento_versoes;
DROP POLICY IF EXISTS "canonical_versoes_update_draft" ON public.procedimento_versoes;
DROP POLICY IF EXISTS "canonical_versoes_delete_draft" ON public.procedimento_versoes;

-- 1. Equipes veem publicados ativos
CREATE POLICY "Equipes veem publicados ativos"
ON public.procedimento_versoes FOR SELECT
TO authenticated
USING (
  status = 'published' 
  AND vigencia_inicio <= CURRENT_DATE 
  AND (vigencia_fim IS NULL OR vigencia_fim > CURRENT_DATE)
);

-- 2. Líderes e admins veem tudo
CREATE POLICY "Líderes e admins veem tudo"
ON public.procedimento_versoes FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'leader'));

-- 3. Líderes e admins inserem drafts
CREATE POLICY "Líderes e admins inserem drafts"
ON public.procedimento_versoes FOR INSERT
TO authenticated
WITH CHECK (
  (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'leader'))
  AND status = 'draft'
);

-- 4. Líderes e admins editam drafts
CREATE POLICY "Líderes e admins editam drafts"
ON public.procedimento_versoes FOR UPDATE
TO authenticated
USING (
  (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'leader'))
  AND status = 'draft'
)
WITH CHECK (
  (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'leader'))
  AND status = 'draft'
);

-- 5. Líderes e admins atualizam status histórico
CREATE POLICY "Líderes e admins atualizam status histórico"
ON public.procedimento_versoes FOR UPDATE
TO authenticated
USING (
  (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'leader'))
  AND status IN ('published', 'suspended')
)
WITH CHECK (
  (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'leader'))
  AND status IN ('published', 'suspended', 'archived')
);

-- 6. Líderes e admins deletam drafts
CREATE POLICY "Líderes e admins deletam drafts"
ON public.procedimento_versoes FOR DELETE
TO authenticated
USING (
  (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'leader'))
  AND status = 'draft'
);

COMMIT;
