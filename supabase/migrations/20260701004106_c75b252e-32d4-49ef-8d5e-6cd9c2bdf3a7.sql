ALTER TABLE public.equipes 
  ADD COLUMN IF NOT EXISTS collaborator1 text,
  ADD COLUMN IF NOT EXISTS collaborator2 text;