
-- Helper CTE pattern: pick canonical (min created_at, then min id) per lower(name)
-- Do this for each catalog, remap references, delete dupes, null-out team_id.

-- 1) TIPOS_SERVICO
WITH ranked AS (
  SELECT id, name, created_at,
    FIRST_VALUE(id) OVER (
      PARTITION BY lower(name)
      ORDER BY (team_id IS NULL) DESC, created_at ASC, id ASC
    ) AS canonical_id
  FROM public.tipos_servico
  WHERE active = true
),
map AS (
  SELECT id AS old_id, canonical_id FROM ranked WHERE id <> canonical_id
)
UPDATE public.servicos s
SET service_type_id = map.canonical_id
FROM map
WHERE s.service_type_id = map.old_id;

DELETE FROM public.tipos_servico t
USING (
  SELECT id, FIRST_VALUE(id) OVER (
    PARTITION BY lower(name)
    ORDER BY (team_id IS NULL) DESC, created_at ASC, id ASC
  ) AS canonical_id
  FROM public.tipos_servico
) r
WHERE t.id = r.id AND r.id <> r.canonical_id;

UPDATE public.tipos_servico SET team_id = NULL WHERE team_id IS NOT NULL;

-- 2) MOTIVOS_INVIABILIDADE
WITH ranked AS (
  SELECT id, name, created_at,
    FIRST_VALUE(id) OVER (
      PARTITION BY lower(name)
      ORDER BY (team_id IS NULL) DESC, created_at ASC, id ASC
    ) AS canonical_id
  FROM public.motivos_inviabilidade
),
map AS (
  SELECT id AS old_id, canonical_id FROM ranked WHERE id <> canonical_id
)
UPDATE public.servicos s
SET reason_id = map.canonical_id
FROM map
WHERE s.reason_id = map.old_id;

DELETE FROM public.motivos_inviabilidade t
USING (
  SELECT id, FIRST_VALUE(id) OVER (
    PARTITION BY lower(name)
    ORDER BY (team_id IS NULL) DESC, created_at ASC, id ASC
  ) AS canonical_id
  FROM public.motivos_inviabilidade
) r
WHERE t.id = r.id AND r.id <> r.canonical_id;

UPDATE public.motivos_inviabilidade SET team_id = NULL WHERE team_id IS NOT NULL;

-- 3) COMPLEMENTOS_SERVICO (no FK from vinculos, but keep vinculos.complement_id in sync if present)
WITH ranked AS (
  SELECT id, name, created_at,
    FIRST_VALUE(id) OVER (
      PARTITION BY lower(name)
      ORDER BY (team_id IS NULL) DESC, created_at ASC, id ASC
    ) AS canonical_id
  FROM public.complementos_servico
),
map AS (
  SELECT id AS old_id, canonical_id FROM ranked WHERE id <> canonical_id
)
UPDATE public.vinculos_complementos v
SET complement_id = map.canonical_id
FROM map
WHERE v.complement_id = map.old_id;

DELETE FROM public.complementos_servico t
USING (
  SELECT id, FIRST_VALUE(id) OVER (
    PARTITION BY lower(name)
    ORDER BY (team_id IS NULL) DESC, created_at ASC, id ASC
  ) AS canonical_id
  FROM public.complementos_servico
) r
WHERE t.id = r.id AND r.id <> r.canonical_id;

UPDATE public.complementos_servico SET team_id = NULL WHERE team_id IS NOT NULL;

-- 4) IMPACTOS
WITH ranked AS (
  SELECT id, name, created_at,
    FIRST_VALUE(id) OVER (
      PARTITION BY lower(name)
      ORDER BY (team_id IS NULL) DESC, created_at ASC, id ASC
    ) AS canonical_id
  FROM public.impactos
),
map AS (
  SELECT id AS old_id, canonical_id FROM ranked WHERE id <> canonical_id
)
UPDATE public.impactos_expediente ie
SET impact_id = map.canonical_id
FROM map
WHERE ie.impact_id = map.old_id;

DELETE FROM public.impactos t
USING (
  SELECT id, FIRST_VALUE(id) OVER (
    PARTITION BY lower(name)
    ORDER BY (team_id IS NULL) DESC, created_at ASC, id ASC
  ) AS canonical_id
  FROM public.impactos
) r
WHERE t.id = r.id AND r.id <> r.canonical_id;

UPDATE public.impactos SET team_id = NULL WHERE team_id IS NOT NULL;

-- 5) Unique index (case-insensitive) on active rows to prevent future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS tipos_servico_name_uniq ON public.tipos_servico (lower(name)) WHERE active;
CREATE UNIQUE INDEX IF NOT EXISTS motivos_inviabilidade_name_uniq ON public.motivos_inviabilidade (lower(name)) WHERE active;
CREATE UNIQUE INDEX IF NOT EXISTS complementos_servico_name_uniq ON public.complementos_servico (lower(name)) WHERE active;
CREATE UNIQUE INDEX IF NOT EXISTS impactos_name_uniq ON public.impactos (lower(name)) WHERE active;

-- 6) RLS: SELECT already open to authenticated. No write policies = writes only via service_role (admin).
--    Drop any team-scoped write policies if they exist (they didn't per \d output, but be defensive).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname='public'
      AND tablename IN ('tipos_servico','motivos_inviabilidade','complementos_servico','impactos')
      AND cmd <> 'SELECT'
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;
