ALTER TABLE public.google_form_settings
  DROP COLUMN IF EXISTS mode,
  DROP COLUMN IF EXISTS prod_form_id,
  DROP COLUMN IF EXISTS prod_entries;

ALTER TABLE public.google_form_settings
  RENAME COLUMN test_form_id TO form_id;
ALTER TABLE public.google_form_settings
  RENAME COLUMN test_entries TO entries;