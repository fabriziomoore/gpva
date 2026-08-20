-- CORREÇÃO DE SEGURANÇA (SEARCH PATH)
BEGIN;

ALTER FUNCTION public.validate_procedure_tree(jsonb) SET search_path = public;
ALTER FUNCTION public.check_procedimento_versao_integrity() SET search_path = public;
ALTER FUNCTION public.prevent_procedimento_versao_historical_delete() SET search_path = public;
ALTER FUNCTION public.publish_procedure_version(uuid, date, uuid) SET search_path = public;

-- check_vigencia_overlap possui argumentos opcionais, alterando pelo nome genérico se necessário
-- mas as acima são as críticas reportadas pelo linter para segurança.

COMMIT;