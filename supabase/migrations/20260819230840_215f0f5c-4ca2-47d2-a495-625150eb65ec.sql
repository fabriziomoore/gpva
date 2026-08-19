-- As funções já tiveram o search_path corrigido. Agora vamos garantir que anon e authenticated não possam executá-las via RPC/API.
REVOKE EXECUTE ON FUNCTION public.check_procedimento_versao_immutability() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_procedimento_versao_delete() FROM anon, authenticated;
