
CREATE TABLE public.google_form_settings (
  id text PRIMARY KEY DEFAULT 'singleton' CHECK (id = 'singleton'),
  mode text NOT NULL DEFAULT 'prod' CHECK (mode IN ('prod','test')),
  prod_form_id text NOT NULL,
  test_form_id text NOT NULL,
  prod_entries jsonb NOT NULL,
  test_entries jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.google_form_settings TO anon, authenticated;
GRANT ALL ON public.google_form_settings TO service_role;

ALTER TABLE public.google_form_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read google form settings"
  ON public.google_form_settings FOR SELECT
  USING (true);

INSERT INTO public.google_form_settings (id, mode, prod_form_id, test_form_id, prod_entries, test_entries)
VALUES (
  'singleton',
  'prod',
  '1FAIpQLSeuWfzbudZ4ZLs0upHcE4mD4kI97fMVdd4GIvG1Y8FIEn5Jgw',
  '1FAIpQLScPmHLgySgoSmwaWod-c0S7QZyOZDDEjeqgATt-Eir_b1kCyg',
  '{"data":"entry.1838130926","lider":"entry.529203145","setor":"entry.1711428450","matricula":"entry.909324107","pagamento":"entry.2138182077","valorAVista":"entry.1890321124","valorTotalParcelado":"entry.2131072094","qtdParcelas":"entry.1468389727"}'::jsonb,
  '{"data":"entry.1623872850","lider":"entry.468998940","setor":"entry.1405459175","matricula":"entry.673101343","pagamento":"entry.831927898","valorAVista":"entry.99377781","valorTotalParcelado":"entry.1571776838","qtdParcelas":"entry.712185748"}'::jsonb
);
