-- Cartões de abastecimento de cada colaborador da equipe (slot 1 = Colaborador
-- 1, slot 2 = Colaborador 2), pra aparecerem em outro celular da equipe.
--
-- A senha NUNCA chega aqui legível: `vault` é o cofre já criptografado no
-- aparelho (AES-GCM com chave PBKDF2 derivada do código pessoal do dono, que
-- nunca sai do celular). Ver src/lib/fuel-cards.ts.
--
-- Acesso: só a própria conta da equipe (auth.uid() = team_id). Líder e admin
-- não têm policy — não leem pelo app.
create table if not exists public.cartoes_abastecimento (
  team_id uuid not null references auth.users(id) on delete cascade,
  slot smallint not null check (slot in (1, 2)),
  matricula text not null default '',
  vault jsonb,
  updated_at timestamptz not null default now(),
  primary key (team_id, slot)
);

grant select, insert, update, delete on public.cartoes_abastecimento to authenticated;
grant all on public.cartoes_abastecimento to service_role;

alter table public.cartoes_abastecimento enable row level security;

drop policy if exists "own fuel cards" on public.cartoes_abastecimento;
create policy "own fuel cards"
  on public.cartoes_abastecimento for all to authenticated
  using (auth.uid() = team_id)
  with check (auth.uid() = team_id);
