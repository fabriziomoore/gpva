ALTER POLICY "team_own_update" ON public.equipes USING (id = (select auth.uid())) WITH CHECK (id = (select auth.uid()));

ALTER POLICY "sh_team_insert" ON public.expedientes WITH CHECK (team_id = (select auth.uid()));
ALTER POLICY "sh_team_update" ON public.expedientes USING (team_id = (select auth.uid()) AND deleted_at IS NULL) WITH CHECK (team_id = (select auth.uid()));
ALTER POLICY "sh_team_delete" ON public.expedientes USING (team_id = (select auth.uid()));

ALTER POLICY "Team reads own catalog order" ON public.catalog_order USING ((select auth.uid()) = team_id);
ALTER POLICY "Team inserts own catalog order" ON public.catalog_order WITH CHECK ((select auth.uid()) = team_id);
ALTER POLICY "Team updates own catalog order" ON public.catalog_order USING ((select auth.uid()) = team_id) WITH CHECK ((select auth.uid()) = team_id);
ALTER POLICY "Team deletes own catalog order" ON public.catalog_order USING ((select auth.uid()) = team_id);

ALTER POLICY "own session write" ON public.active_sessions WITH CHECK ((select auth.uid()) = user_id);
ALTER POLICY "own session update" ON public.active_sessions USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY "sv_team_insert" ON public.servicos WITH CHECK (team_id = (select auth.uid()));
ALTER POLICY "sv_team_update" ON public.servicos USING (team_id = (select auth.uid()) AND deleted_at IS NULL) WITH CHECK (team_id = (select auth.uid()));
ALTER POLICY "sv_team_delete" ON public.servicos USING (team_id = (select auth.uid()));

ALTER POLICY "scl_team_insert" ON public.vinculos_complementos WITH CHECK (team_id = (select auth.uid()));
ALTER POLICY "scl_team_update" ON public.vinculos_complementos USING (team_id = (select auth.uid()) AND deleted_at IS NULL) WITH CHECK (team_id = (select auth.uid()));
ALTER POLICY "scl_team_delete" ON public.vinculos_complementos USING (team_id = (select auth.uid()));

ALTER POLICY "si_team_insert" ON public.impactos_expediente WITH CHECK (team_id = (select auth.uid()));
ALTER POLICY "si_team_update" ON public.impactos_expediente USING (team_id = (select auth.uid()) AND deleted_at IS NULL) WITH CHECK (team_id = (select auth.uid()));
ALTER POLICY "si_team_delete" ON public.impactos_expediente USING (team_id = (select auth.uid()));

ALTER POLICY "setores_admin_insert" ON public.setores WITH CHECK (public.has_role((select auth.uid()), 'admin'));
ALTER POLICY "setores_admin_update" ON public.setores USING (public.has_role((select auth.uid()), 'admin')) WITH CHECK (public.has_role((select auth.uid()), 'admin'));
ALTER POLICY "setores_admin_delete" ON public.setores USING (public.has_role((select auth.uid()), 'admin'));

ALTER POLICY "Admins can read audit reports" ON public.audit_reports USING (public.has_role((select auth.uid()), 'admin'));
ALTER POLICY "Admins can insert audit reports" ON public.audit_reports WITH CHECK (public.has_role((select auth.uid()), 'admin'));
ALTER POLICY "Admins can delete audit reports" ON public.audit_reports USING (public.has_role((select auth.uid()), 'admin'));

ALTER POLICY "Users read own roles" ON public.user_roles USING ((select auth.uid()) = user_id);

ALTER POLICY "admin_select" ON public.supervisores USING (public.has_role((select auth.uid()), 'admin'));
ALTER POLICY "admin_insert" ON public.supervisores WITH CHECK (public.has_role((select auth.uid()), 'admin'));
ALTER POLICY "admin_update" ON public.supervisores USING (public.has_role((select auth.uid()), 'admin')) WITH CHECK (public.has_role((select auth.uid()), 'admin'));
ALTER POLICY "admin_delete" ON public.supervisores USING (public.has_role((select auth.uid()), 'admin'));

ALTER POLICY "admin_select" ON public.lideres_estrutura USING (public.has_role((select auth.uid()), 'admin'));
ALTER POLICY "admin_insert" ON public.lideres_estrutura WITH CHECK (public.has_role((select auth.uid()), 'admin'));
ALTER POLICY "admin_update" ON public.lideres_estrutura USING (public.has_role((select auth.uid()), 'admin')) WITH CHECK (public.has_role((select auth.uid()), 'admin'));
ALTER POLICY "admin_delete" ON public.lideres_estrutura USING (public.has_role((select auth.uid()), 'admin'));

ALTER POLICY "Líderes e admins inserem drafts" ON public.procedimento_versoes WITH CHECK ((public.has_role((select auth.uid()), 'admin') OR public.has_role((select auth.uid()), 'leader')) AND status = 'draft');
ALTER POLICY "Líderes e admins deletam drafts" ON public.procedimento_versoes USING ((public.has_role((select auth.uid()), 'admin') OR public.has_role((select auth.uid()), 'leader')) AND status = 'draft');

DROP POLICY IF EXISTS "Líderes e Admins podem gerenciar procedimentos" ON public.procedimentos;
CREATE POLICY "Líderes e Admins inserem procedimentos" ON public.procedimentos FOR INSERT TO authenticated WITH CHECK (public.has_role((select auth.uid()), 'admin') OR public.has_role((select auth.uid()), 'leader'));
CREATE POLICY "Líderes e Admins atualizam procedimentos" ON public.procedimentos FOR UPDATE TO authenticated USING (public.has_role((select auth.uid()), 'admin') OR public.has_role((select auth.uid()), 'leader')) WITH CHECK (public.has_role((select auth.uid()), 'admin') OR public.has_role((select auth.uid()), 'leader'));
CREATE POLICY "Líderes e Admins removem procedimentos" ON public.procedimentos FOR DELETE TO authenticated USING (public.has_role((select auth.uid()), 'admin') OR public.has_role((select auth.uid()), 'leader'));
