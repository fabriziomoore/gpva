REVOKE ALL ON TABLE public.equipes FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.expedientes FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.servicos FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.vinculos_complementos FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.impactos_expediente FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.catalog_order FROM anon, PUBLIC;

GRANT SELECT, UPDATE ON TABLE public.equipes TO authenticated;
GRANT ALL ON TABLE public.equipes TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.expedientes TO authenticated;
GRANT ALL ON TABLE public.expedientes TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.servicos TO authenticated;
GRANT ALL ON TABLE public.servicos TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.vinculos_complementos TO authenticated;
GRANT ALL ON TABLE public.vinculos_complementos TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.impactos_expediente TO authenticated;
GRANT ALL ON TABLE public.impactos_expediente TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.catalog_order TO authenticated;
GRANT ALL ON TABLE public.catalog_order TO service_role;