REVOKE EXECUTE ON FUNCTION public.operational_visible_team_ids() FROM anon;
GRANT EXECUTE ON FUNCTION public.operational_visible_team_ids() TO authenticated, service_role;