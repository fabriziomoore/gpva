ALTER TABLE public.servicos
  ADD COLUMN IF NOT EXISTS lat double precision,
  ADD COLUMN IF NOT EXISTS lng double precision,
  ADD COLUMN IF NOT EXISTS accuracy_m double precision,
  ADD COLUMN IF NOT EXISTS captured_at timestamptz;

CREATE INDEX IF NOT EXISTS servicos_geo_idx ON public.servicos (team_id, created_at DESC) WHERE lat IS NOT NULL AND lng IS NOT NULL;