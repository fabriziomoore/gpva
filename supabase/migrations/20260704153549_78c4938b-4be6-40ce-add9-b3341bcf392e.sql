-- Marca equipes de teste com uma flag persistente, independente do nome
ALTER TABLE public.equipes
  ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

-- Marca a equipe de apresentação atual (RIOTESTE-01) como teste
UPDATE public.equipes
   SET is_test = true
 WHERE id = '458dd5c0-94fa-4b90-b737-f15a0884f3f7';

-- Também mantém compatibilidade com o antigo filtro por nome
UPDATE public.equipes
   SET is_test = true
 WHERE team_name = 'TESTANDO';