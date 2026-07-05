DROP POLICY IF EXISTS "Google form settings are readable" ON public.google_form_settings;
REVOKE SELECT ON public.google_form_settings FROM anon;
CREATE POLICY "Google form settings readable by authenticated"
  ON public.google_form_settings FOR SELECT
  TO authenticated
  USING (true);