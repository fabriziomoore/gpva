-- 1. Limpeza de privilégios existentes
REVOKE ALL ON public.procedimento_versoes FROM internal_proc_executor;
REVOKE ALL ON public.procedimentos FROM internal_proc_executor;

-- 2. Concessão mínima em procedimento_versoes
GRANT SELECT, UPDATE ON public.procedimento_versoes TO internal_proc_executor;

-- 3. Concessão mínima em procedimentos
GRANT SELECT ON public.procedimentos TO internal_proc_executor;
GRANT UPDATE (id) ON public.procedimentos TO internal_proc_executor;

-- 4. Garantia de acesso ao schema
GRANT USAGE ON SCHEMA public TO internal_proc_executor;
