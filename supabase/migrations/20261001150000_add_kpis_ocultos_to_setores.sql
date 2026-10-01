-- Cards do Expediente (Total, Viáveis, Inviáveis, Efetividade, Tempo M. O.S)
-- que o setor NÃO mostra, configurado em Admin → Setores. Lista vazia =
-- mostra todos (comportamento de antes). Negociado e Variável continuam
-- controlados por negociacao_ativa / variavel_ativo.
alter table public.setores
  add column if not exists kpis_ocultos text[] not null default '{}';
