-- Sobrenome de cada colaborador, coletado no popup obrigatório de
-- completar cadastro (junto com a placa do veículo) e usado para montar o
-- nome completo do "Condutor do Dia" no Forms de início de expediente.
-- Nome (collaborator1/2) já existe e continua sendo só o primeiro nome —
-- usado sozinho no card da Home.
alter table public.equipes add column if not exists collaborator1_lastname text;
alter table public.equipes add column if not exists collaborator2_lastname text;
