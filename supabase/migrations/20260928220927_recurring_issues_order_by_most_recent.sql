-- recurring_issues() passa a ordenar pelas ocorrências mais recentes
-- primeiro (last_at desc), em vez de priorizar quem tem mais visitas
-- (cnt desc, last_at desc). Resto da função permanece idêntico.
CREATE OR REPLACE FUNCTION public.recurring_issues()
 RETURNS TABLE(registration_number text, reason_name text, cnt bigint, last_at timestamp with time zone, team_names text[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    s.registration_number,
    (array_agg(s.reason_name order by s.created_at desc))[1] as reason_name,
    count(*) as cnt,
    max(s.created_at) as last_at,
    array_agg(distinct e.team_name) as team_names
  from servicos s
  join equipes e on e.id = s.team_id
  where auth.uid() is not null
    and s.deleted_at is null
    and s.viable = false
    and s.registration_number is not null
    and s.reason_name is not null
    and e.is_test = false
    and lower(trim(e.team_name)) <> 'adm'
    and e.id <> all(select admin_user_ids())
  group by s.registration_number
  having count(*) >= 2
  order by last_at desc
  limit 50;
$function$
