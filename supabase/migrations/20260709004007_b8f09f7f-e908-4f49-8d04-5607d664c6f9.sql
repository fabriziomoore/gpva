REVOKE ALL ON TABLE public.user_roles FROM authenticated;
GRANT SELECT ON TABLE public.user_roles TO authenticated;
GRANT ALL ON TABLE public.user_roles TO service_role;

REVOKE ALL ON TABLE public.equipes FROM authenticated;
GRANT SELECT, UPDATE ON TABLE public.equipes TO authenticated;
GRANT ALL ON TABLE public.equipes TO service_role;

REVOKE ALL ON TABLE public.expedientes FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.expedientes TO authenticated;
GRANT ALL ON TABLE public.expedientes TO service_role;

REVOKE ALL ON TABLE public.servicos FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.servicos TO authenticated;
GRANT ALL ON TABLE public.servicos TO service_role;

REVOKE ALL ON TABLE public.vinculos_complementos FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.vinculos_complementos TO authenticated;
GRANT ALL ON TABLE public.vinculos_complementos TO service_role;

REVOKE ALL ON TABLE public.impactos_expediente FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.impactos_expediente TO authenticated;
GRANT ALL ON TABLE public.impactos_expediente TO service_role;

REVOKE ALL ON TABLE public.catalog_order FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.catalog_order TO authenticated;
GRANT ALL ON TABLE public.catalog_order TO service_role;