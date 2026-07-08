-- Lock down the private 'database_export_08_07_26' bucket.
-- Only service_role (edge functions / admin code) can access these export files.
-- Users can only touch objects if they are an app admin (public.has_role).

CREATE POLICY "db_export admins read"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'database_export_08_07_26'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "db_export admins insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'database_export_08_07_26'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "db_export admins update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'database_export_08_07_26'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
)
WITH CHECK (
  bucket_id = 'database_export_08_07_26'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "db_export admins delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'database_export_08_07_26'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);
