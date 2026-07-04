CREATE TABLE public.audit_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  duration_ms integer NOT NULL,
  overall_score integer NOT NULL,
  counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  report jsonb NOT NULL
);

GRANT SELECT, INSERT, DELETE ON public.audit_reports TO authenticated;
GRANT ALL ON public.audit_reports TO service_role;

ALTER TABLE public.audit_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read audit reports"
  ON public.audit_reports FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert audit reports"
  ON public.audit_reports FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete audit reports"
  ON public.audit_reports FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));