REVOKE ALL ON TABLE public.user_roles FROM anon, PUBLIC;
GRANT SELECT ON TABLE public.user_roles TO authenticated;
GRANT ALL ON TABLE public.user_roles TO service_role;

ALTER FUNCTION public.has_role(uuid, public.app_role) SECURITY INVOKER;