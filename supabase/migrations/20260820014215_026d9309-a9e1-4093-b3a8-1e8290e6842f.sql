-- REMEDIAÇÃO FINAL DE SEGURANÇA E SANEAMENTO (CORRIGIDO)
BEGIN;

-- 1. SEARCH PATH PARA TODAS AS FUNÇÕES DE PROCEDIMENTOS (Linter 0011)
ALTER FUNCTION public.check_vigencia_overlap() SET search_path = public;
ALTER FUNCTION public.prevent_procedimento_versao_historical_delete() SET search_path = public;

-- 2. REVOGA ACESSO PÚBLICO/ANON (Linter 0028)
REVOKE EXECUTE ON FUNCTION public.check_procedimento_versao_integrity() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_procedimento_versao_integrity() FROM anon;
REVOKE EXECUTE ON FUNCTION public.publish_procedure_version(uuid, date, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.publish_procedure_version(uuid, date, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_procedure_with_version(text, text, text, text, text, date, date, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_procedure_with_version(text, text, text, text, text, date, date, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.validate_procedure_tree(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_procedure_tree(jsonb) FROM anon;

-- 3. GARANTE PRIVILÉGIOS MÍNIMOS (AUTHENTICATED E SERVICE_ROLE)
GRANT EXECUTE ON FUNCTION public.check_procedimento_versao_integrity() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.publish_procedure_version(uuid, date, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_procedure_with_version(text, text, text, text, text, date, date, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.validate_procedure_tree(jsonb) TO authenticated, service_role;

-- 4. PRIVILÉGIOS DO ROLE INTERNO
GRANT SELECT ON public.procedimentos TO internal_proc_executor;
GRANT UPDATE(id) ON public.procedimentos TO internal_proc_executor;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.procedimento_versoes TO internal_proc_executor;

COMMIT;