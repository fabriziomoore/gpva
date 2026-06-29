
ALTER TABLE public.teams RENAME TO equipes;
ALTER TABLE public.impacts RENAME TO impactos;
ALTER TABLE public.services RENAME TO servicos;
ALTER TABLE public.shifts RENAME TO expedientes;
ALTER TABLE public.inviability_reasons RENAME TO motivos_inviabilidade;
ALTER TABLE public.service_types RENAME TO tipos_servico;
ALTER TABLE public.service_complements RENAME TO complementos_servico;
ALTER TABLE public.service_complement_links RENAME TO vinculos_complementos;
ALTER TABLE public.shift_impacts RENAME TO impactos_expediente;

CREATE OR REPLACE FUNCTION public.handle_new_team()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_team_name text;
BEGIN
  v_team_name := COALESCE(NEW.raw_user_meta_data->>'team_name', split_part(NEW.email, '@', 1));

  INSERT INTO public.equipes (id, team_name) VALUES (NEW.id, v_team_name);

  INSERT INTO public.tipos_servico (team_id, name, is_negotiation, sort_order) VALUES
    (NEW.id, 'Corte Cavalete', false, 1),
    (NEW.id, 'Corte Ramal', false, 2),
    (NEW.id, 'Religação', false, 3),
    (NEW.id, 'Negociação', true, 4),
    (NEW.id, 'Fiscalização', false, 5),
    (NEW.id, 'Revisita', false, 6);

  INSERT INTO public.motivos_inviabilidade (team_id, name) VALUES
    (NEW.id, 'Área de risco'),
    (NEW.id, 'Ligação inexistente'),
    (NEW.id, 'Ramal não localizado'),
    (NEW.id, 'Suspenso'),
    (NEW.id, 'Cliente ausente'),
    (NEW.id, 'Imóvel fechado');

  INSERT INTO public.impactos (team_id, name) VALUES
    (NEW.id, 'Condições climáticas'),
    (NEW.id, 'Área de risco'),
    (NEW.id, 'Cliente agressivo'),
    (NEW.id, 'Apoio policial'),
    (NEW.id, 'Veículo quebrado'),
    (NEW.id, 'Falta de material');

  INSERT INTO public.complementos_servico (team_id, name, sort_order) VALUES
    (NEW.id, 'Substituição de HD', 1),
    (NEW.id, 'Lavagem de Rede', 2),
    (NEW.id, 'Apoio', 3),
    (NEW.id, 'Retorno', 4),
    (NEW.id, 'Vistoria', 5),
    (NEW.id, 'Outros', 6);

  RETURN NEW;
END;
$function$;
