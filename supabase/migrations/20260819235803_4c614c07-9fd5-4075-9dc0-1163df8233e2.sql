-- Correção de segurança linter para funções recém-criadas

-- Ajustar search_path para todas as novas funções para evitar vulnerabilidades de search_path mutable
ALTER FUNCTION public.validate_versao_substituicao() SET search_path = public;
ALTER FUNCTION public.check_vigencia_overlap() SET search_path = public;
ALTER FUNCTION public.enforce_versao_immutability() SET search_path = public;
ALTER FUNCTION public.prevent_versao_deletion() SET search_path = public;

-- create_procedure_with_version já possui search_path = public e SECURITY DEFINER.
-- Como é uma função administrativa (leader/admin), vamos remover o acesso público (anon) explicitamente,
-- embora o grant anterior tenha sido apenas para authenticated.
REVOKE EXECUTE ON FUNCTION public.create_procedure_with_version(TEXT, TEXT, TEXT, TEXT, TEXT, DATE, DATE, JSONB) FROM public;
REVOKE EXECUTE ON FUNCTION public.create_procedure_with_version(TEXT, TEXT, TEXT, TEXT, TEXT, DATE, DATE, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_procedure_with_version(TEXT, TEXT, TEXT, TEXT, TEXT, DATE, DATE, JSONB) TO authenticated;
