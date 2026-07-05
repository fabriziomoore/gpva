REVOKE EXECUTE ON FUNCTION public.handle_new_team() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_team() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_team() FROM authenticated;