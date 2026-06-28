
ALTER TABLE public.service_types ALTER COLUMN team_id DROP NOT NULL;
ALTER TABLE public.inviability_reasons ALTER COLUMN team_id DROP NOT NULL;
ALTER TABLE public.service_complements ALTER COLUMN team_id DROP NOT NULL;
ALTER TABLE public.impacts ALTER COLUMN team_id DROP NOT NULL;

DROP POLICY IF EXISTS st_team_all ON public.service_types;
DROP POLICY IF EXISTS ir_team_all ON public.inviability_reasons;
DROP POLICY IF EXISTS sc_team_all ON public.service_complements;
DROP POLICY IF EXISTS im_team_all ON public.impacts;

CREATE POLICY st_read_all ON public.service_types FOR SELECT TO authenticated USING (true);
CREATE POLICY ir_read_all ON public.inviability_reasons FOR SELECT TO authenticated USING (true);
CREATE POLICY sc_read_all ON public.service_complements FOR SELECT TO authenticated USING (true);
CREATE POLICY im_read_all ON public.impacts FOR SELECT TO authenticated USING (true);
