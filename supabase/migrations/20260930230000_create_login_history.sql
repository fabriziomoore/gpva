-- Histórico de login de todas as contas (equipe, líder e admin): uma linha
-- por login bem-sucedido, gravada pelo próprio app logo após entrar. Logins
-- offline ficam numa fila no aparelho e sobem quando a conexão volta, com o
-- horário real em que aconteceram (logged_at vem do aparelho) e offline=true.
-- Leitura só pelo admin, via service_role (server function / admin-api).
create table if not exists public.login_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  logged_at timestamptz not null default now(),
  offline boolean not null default false,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists login_history_logged_at_idx on public.login_history (logged_at);
create index if not exists login_history_user_logged_at_idx on public.login_history (user_id, logged_at);

grant insert on public.login_history to authenticated;
grant all on public.login_history to service_role;

alter table public.login_history enable row level security;

drop policy if exists "own login insert" on public.login_history;
create policy "own login insert"
  on public.login_history for insert to authenticated
  with check (auth.uid() = user_id);
