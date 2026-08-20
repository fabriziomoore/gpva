-- CORREÇÃO DE SEGURANÇA FINAL (SEARCH PATH E PRIVILÉGIOS)
BEGIN;

-- 1. SEARCH PATH PARA TODAS AS FUNÇÕES DE PROCEDIMENTOS (Linter 0011)
ALTER FUNCTION public.create_procedure_with_version(text, text, text, text, text, date, date, jsonb) SET search_path = public;
ALTER FUNCTION public.has_role(uuid, public.app_role) SET search_path = public;

-- 2. GARANTE REVOKE PUBLIC EM TODAS AS CRÍTICAS
REVOKE EXECUTE ON FUNCTION public.publish_procedure_version(uuid, date, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_procedure_with_version(text, text, text, text, text, date, date, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_procedure_tree(jsonb) FROM PUBLIC;

-- 3. PERMISSÕES EXPLÍCITAS APENAS PARA AUTHENTICATED
GRANT EXECUTE ON FUNCTION public.publish_procedure_version(uuid, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_procedure_with_version(text, text, text, text, text, date, date, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_procedure_tree(jsonb) TO authenticated;

-- 4. PERMISSÕES PARA SERVICE_ROLE (Backup administrativo)
GRANT EXECUTE ON FUNCTION public.publish_procedure_version(uuid, date, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_procedure_with_version(text, text, text, text, text, date, date, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.validate_procedure_tree(jsonb) TO service_role;

COMMIT;