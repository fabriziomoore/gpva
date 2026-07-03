ALTER PUBLICATION supabase_realtime ADD TABLE public.servicos, public.expedientes, public.impactos_expediente, public.vinculos_complementos, public.equipes;
ALTER TABLE public.servicos REPLICA IDENTITY FULL;
ALTER TABLE public.expedientes REPLICA IDENTITY FULL;
ALTER TABLE public.impactos_expediente REPLICA IDENTITY FULL;
ALTER TABLE public.vinculos_complementos REPLICA IDENTITY FULL;
ALTER TABLE public.equipes REPLICA IDENTITY FULL;