-- REMEDIAÇÃO FINAL DE SEGURANÇA
BEGIN;

-- 1. SEARCH PATH PARA A FUNÇÃO DE VALIDAÇÃO (Linter 0011)
ALTER FUNCTION public.validate_procedure_tree(jsonb) SET search_path = public;

-- 2. REMOVE ACESSO ANON (Linter 0028)
REVOKE EXECUTE ON FUNCTION public.validate_procedure_tree(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_procedure_tree(jsonb) FROM anon;

-- 3. MANTÉM APENAS AUTHENTICATED/SERVICE_ROLE (Linter 0029 - falsos positivos recorrentes, mas garantimos privilégios mínimos)
GRANT EXECUTE ON FUNCTION public.validate_procedure_tree(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_procedure_tree(jsonb) TO service_role;

COMMIT;