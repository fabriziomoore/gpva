-- 1) Tabela setores
CREATE TABLE public.setores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,
  supervisor_nome text NOT NULL DEFAULT '',
  supervisor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.setores TO authenticated;
GRANT ALL ON public.setores TO service_role;

ALTER TABLE public.setores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "setores_read_all_authenticated"
  ON public.setores FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "setores_admin_insert"
  ON public.setores FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "setores_admin_update"
  ON public.setores FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "setores_admin_delete"
  ON public.setores FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER trg_setores_updated_at
  BEFORE UPDATE ON public.setores
  FOR EACH ROW EXECUTE FUNCTION public.touch_catalog_order_updated_at();

-- 2) Setor default "Corte e Religa" com o supervisor mais frequente
INSERT INTO public.setores (nome, supervisor_nome)
SELECT
  'Corte e Religa',
  COALESCE(
    (SELECT supervisor FROM public.equipes
       WHERE supervisor <> ''
       GROUP BY supervisor
       ORDER BY count(*) DESC
       LIMIT 1),
    ''
  );

-- 3) Coluna setor_id em equipes e migração dos dados existentes
ALTER TABLE public.equipes
  ADD COLUMN setor_id uuid REFERENCES public.setores(id) ON DELETE RESTRICT;

UPDATE public.equipes
  SET setor_id = (SELECT id FROM public.setores WHERE nome = 'Corte e Religa' LIMIT 1);

ALTER TABLE public.equipes
  ALTER COLUMN setor_id SET NOT NULL;

CREATE INDEX equipes_setor_id_idx ON public.equipes(setor_id);