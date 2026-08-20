-- 1. Remover TODAS as policies existentes em procedimento_versoes (dependência de colunas)
DROP POLICY IF EXISTS "Equipes veem publicados ativos" ON public.procedimento_versoes;
DROP POLICY IF EXISTS "Líderes e admins veem tudo" ON public.procedimento_versoes;
DROP POLICY IF EXISTS "Líderes e admins inserem drafts" ON public.procedimento_versoes;
DROP POLICY IF EXISTS "Líderes e admins editam drafts" ON public.procedimento_versoes;
DROP POLICY IF EXISTS "Líderes e admins atualizam status histórico" ON public.procedimento_versoes;
DROP POLICY IF EXISTS "Líderes e admins deletam drafts" ON public.procedimento_versoes;
-- Policy legada reportada no erro anterior
DROP POLICY IF EXISTS "Equipe lê apenas publicados e vigentes" ON public.procedimento_versoes;
