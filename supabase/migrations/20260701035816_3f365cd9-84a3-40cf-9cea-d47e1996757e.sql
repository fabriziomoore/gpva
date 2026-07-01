
CREATE TABLE public.catalog_order (
  team_id uuid NOT NULL REFERENCES public.equipes(id) ON DELETE CASCADE,
  catalog text NOT NULL CHECK (catalog IN ('tipos_servico','motivos_inviabilidade','complementos_servico','impactos')),
  item_ids uuid[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, catalog)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalog_order TO authenticated;
GRANT ALL ON public.catalog_order TO service_role;

ALTER TABLE public.catalog_order ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team reads own catalog order"
  ON public.catalog_order FOR SELECT
  TO authenticated
  USING (auth.uid() = team_id);

CREATE POLICY "Team inserts own catalog order"
  ON public.catalog_order FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = team_id);

CREATE POLICY "Team updates own catalog order"
  ON public.catalog_order FOR UPDATE
  TO authenticated
  USING (auth.uid() = team_id)
  WITH CHECK (auth.uid() = team_id);

CREATE POLICY "Team deletes own catalog order"
  ON public.catalog_order FOR DELETE
  TO authenticated
  USING (auth.uid() = team_id);

CREATE OR REPLACE FUNCTION public.touch_catalog_order_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_catalog_order_updated_at
  BEFORE UPDATE ON public.catalog_order
  FOR EACH ROW EXECUTE FUNCTION public.touch_catalog_order_updated_at();
