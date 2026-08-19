-- Ajustando funções para SECURITY DEFINER com search_path seguro e revogando execução pública
ALTER FUNCTION public.check_procedimento_versao_immutability() SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.check_procedimento_versao_immutability() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_procedimento_versao_immutability() TO service_role;

ALTER FUNCTION public.prevent_procedimento_versao_delete() SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.prevent_procedimento_versao_delete() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prevent_procedimento_versao_delete() TO service_role;
