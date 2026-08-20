DO $$
BEGIN
    -- Cria a role se não existir
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'internal_proc_executor') THEN
        CREATE ROLE internal_proc_executor WITH NOLOGIN NOINHERIT BYPASSRLS;
    END IF;
    
    -- O usuário da migração (geralmente postgres ou service_role na Lovable Cloud)
    -- precisa de permissão para assumir a role e trocar o OWNER da função.
    EXECUTE 'GRANT internal_proc_executor TO ' || current_user;
    
    RAISE NOTICE 'Role criada e membership concedido ao usuário atual (%)', current_user;
END
$$;
