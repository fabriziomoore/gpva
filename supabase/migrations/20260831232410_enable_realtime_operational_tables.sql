ALTER TABLE public.active_sessions REPLICA IDENTITY FULL;
ALTER TABLE public.equipes REPLICA IDENTITY FULL;
ALTER TABLE public.expedientes REPLICA IDENTITY FULL;
ALTER TABLE public.impactos_expediente REPLICA IDENTITY FULL;
ALTER TABLE public.servicos REPLICA IDENTITY FULL;
ALTER TABLE public.vinculos_complementos REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.active_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.equipes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.expedientes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.impactos_expediente;
ALTER PUBLICATION supabase_realtime ADD TABLE public.servicos;
ALTER PUBLICATION supabase_realtime ADD TABLE public.vinculos_complementos;
