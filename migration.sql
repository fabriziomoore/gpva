BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'internal_proc_executor') THEN
        CREATE ROLE internal_proc_executor WITH NOLOGIN NOINHERIT BYPASSRLS;
    END IF;
END $$;

GRANT USAGE ON SCHEMA public TO internal_proc_executor;
GRANT SELECT ON public.procedimento_versoes TO internal_proc_executor;
GRANT SELECT ON public.procedimentos TO internal_proc_executor;

-- Trigger/RPC/Policies conforme o plano
-- ... (restante do SQL)
COMMIT;
