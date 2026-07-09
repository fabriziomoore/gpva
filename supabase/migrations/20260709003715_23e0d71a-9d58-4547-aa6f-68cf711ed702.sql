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