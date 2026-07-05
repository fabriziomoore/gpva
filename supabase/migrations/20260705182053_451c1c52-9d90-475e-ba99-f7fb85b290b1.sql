REVOKE EXECUTE ON FUNCTION public.admin_user_ids() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_user_ids() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_user_ids() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_user_ids() TO service_role;