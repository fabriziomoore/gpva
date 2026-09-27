-- Placa do veículo associada à equipe, usada para preencher automaticamente
-- o Forms "Registro Diário do Condutor" ao iniciar o expediente.
alter table public.equipes add column if not exists vehicle_plate text;
