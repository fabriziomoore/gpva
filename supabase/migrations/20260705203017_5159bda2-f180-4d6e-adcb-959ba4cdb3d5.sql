
CREATE OR REPLACE FUNCTION public.audit_schema_snapshot()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  WITH tabs AS (
    SELECT c.oid, c.relname AS table_name,
           c.relrowsecurity AS rls_enabled,
           c.relforcerowsecurity AS rls_forced
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
  ),
  pols AS (
    SELECT p.polrelid,
           count(*) AS pol_count,
           jsonb_agg(jsonb_build_object(
             'name', p.polname,
             'cmd', CASE p.polcmd
                      WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT'
                      WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE'
                      WHEN '*' THEN 'ALL' ELSE p.polcmd::text END,
             'permissive', p.polpermissive,
             'roles', (SELECT array_agg(r.rolname) FROM pg_roles r WHERE r.oid = ANY(p.polroles))
           )) AS policies
    FROM pg_policy p
    GROUP BY p.polrelid
  ),
  grants AS (
    SELECT table_name, grantee, array_agg(DISTINCT privilege_type ORDER BY privilege_type) AS privs
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND grantee IN ('anon','authenticated','service_role')
    GROUP BY table_name, grantee
  )
  SELECT jsonb_agg(jsonb_build_object(
    'table', t.table_name,
    'rls_enabled', t.rls_enabled,
    'rls_forced', t.rls_forced,
    'policy_count', COALESCE(pl.pol_count, 0),
    'policies', COALESCE(pl.policies, '[]'::jsonb),
    'grants', COALESCE(
      (SELECT jsonb_object_agg(g.grantee, to_jsonb(g.privs)) FROM grants g WHERE g.table_name = t.table_name),
      '{}'::jsonb
    )
  ) ORDER BY t.table_name)
  FROM tabs t
  LEFT JOIN pols pl ON pl.polrelid = t.oid;
$$;

REVOKE ALL ON FUNCTION public.audit_schema_snapshot() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.audit_schema_snapshot() TO service_role;
