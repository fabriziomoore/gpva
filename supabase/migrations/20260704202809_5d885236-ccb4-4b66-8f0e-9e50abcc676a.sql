ALTER TABLE public.google_form_settings RENAME COLUMN form_id TO test_form_id;
ALTER TABLE public.google_form_settings RENAME COLUMN entries TO test_entries;

ALTER TABLE public.google_form_settings
  ADD COLUMN mode text NOT NULL DEFAULT 'test' CHECK (mode IN ('prod','test')),
  ADD COLUMN prod_form_id text,
  ADD COLUMN prod_entries jsonb;

UPDATE public.google_form_settings SET
  prod_form_id = '1FAIpQLSeuWfzbudZ4ZLs0upHcE4mD4kI97fMVdd4GIvG1Y8FIEn5Jgw',
  prod_entries = '{"data":"entry.1838130926","lider":"entry.529203145","matricula":"entry.909324107","pagamento":"entry.2138182077","qtdParcelas":"entry.1468389727","setor":"entry.1711428450","valorAVista":"entry.1890321124","valorTotalParcelado":"entry.2131072094"}'::jsonb
  WHERE id = 'singleton';

ALTER TABLE public.google_form_settings
  ALTER COLUMN prod_form_id SET NOT NULL,
  ALTER COLUMN prod_entries SET NOT NULL;