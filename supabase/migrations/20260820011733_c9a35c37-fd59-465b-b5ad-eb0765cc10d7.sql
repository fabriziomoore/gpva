-- 1. Privilégios Mínimos para a Identidade Interna
GRANT SELECT, UPDATE ON public.procedimento_versoes TO internal_proc_executor;
GRANT SELECT ON public.procedimentos TO internal_proc_executor;
GRANT UPDATE(id) ON public.procedimentos TO internal_proc_executor;
GRANT USAGE ON SCHEMA public TO internal_proc_executor;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO internal_proc_executor;

-- 2. Conversão SemântICA DATE (Preservando America/Sao_Paulo)
ALTER TABLE public.procedimento_versoes 
    ALTER COLUMN vigencia_inicio TYPE DATE USING (vigencia_inicio AT TIME ZONE 'America/Sao_Paulo')::DATE,
    ALTER COLUMN vigencia_fim TYPE DATE USING (vigencia_fim AT TIME ZONE 'America/Sao_Paulo')::DATE;

-- 3. Consolidação de Triggers
CREATE OR REPLACE FUNCTION public.check_procedimento_versao_integrity()
RETURNS TRIGGER AS $$
DECLARE
    is_internal boolean;
BEGIN
    is_internal := (current_user = 'internal_proc_executor');

    IF is_internal THEN
        IF OLD.status = 'draft' AND NEW.status = 'published' THEN
            IF (OLD.procedimento_id != NEW.procedimento_id OR OLD.arvore_decisao != NEW.arvore_decisao OR OLD.categoria != NEW.categoria OR OLD.setor != NEW.setor OR OLD.fonte != NEW.fonte) THEN
                RAISE EXCEPTION 'Trilha Interna: Caso A permite apenas campos de status e auditoria.';
            END IF;
            RETURN NEW;
        END IF;

        IF OLD.status = 'published' AND NEW.status = 'published' THEN
            IF (OLD.procedimento_id != NEW.procedimento_id OR OLD.arvore_decisao != NEW.arvore_decisao OR OLD.status != NEW.status OR OLD.published_at != NEW.published_at OR OLD.publicado_por_id != NEW.publicado_por_id OR OLD.status_updated_at != NEW.status_updated_at OR OLD.status_alterado_por_id != NEW.status_alterado_por_id) THEN
                RAISE EXCEPTION 'Trilha Interna: Caso B permite apenas alteração de vigencia_fim.';
            END IF;
            RETURN NEW;
        END IF;
        
        RAISE EXCEPTION 'Trilha Interna: Transição não autorizada.';
    END IF;

    IF NOT is_internal THEN
        IF OLD.status != 'draft' AND (OLD.procedimento_id != NEW.procedimento_id OR OLD.arvore_decisao != NEW.arvore_decisao OR OLD.categoria != NEW.categoria OR OLD.setor != NEW.setor OR OLD.fonte != NEW.fonte) THEN
            RAISE EXCEPTION 'Trilha Normal: Alteração de conteúdo proibida em versões não-draft.';
        END IF;

        IF OLD.status = 'published' AND NEW.status NOT IN ('suspended', 'archived') THEN
            RAISE EXCEPTION 'Trilha Normal: Transição de status inválida.';
        END IF;
        
        NEW.status_updated_at := now();
        NEW.status_alterado_por_id := auth.uid();
        
        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_procedimento_versao_integrity
BEFORE UPDATE ON public.procedimento_versoes
FOR EACH ROW EXECUTE FUNCTION public.check_procedimento_versao_integrity();

CREATE OR REPLACE FUNCTION public.prevent_procedimento_versao_historical_delete()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status = 'draft' THEN
        RETURN OLD;
    END IF;
    RAISE EXCEPTION 'Deleção física proibida para versões históricas.';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_procedimento_versao_delete_historical
BEFORE DELETE ON public.procedimento_versoes
FOR EACH ROW EXECUTE FUNCTION public.prevent_procedimento_versao_historical_delete();

-- 4. RPC de Publicação Atômica (Redefinição sem troca de OWNER ainda)
CREATE OR REPLACE FUNCTION public.publish_procedure_version(
    p_versao_id uuid,
    p_vigencia_inicio date,
    p_substitui_versao_id uuid DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
    v_procedimento_id uuid;
    v_target_status text;
    v_old_procedimento_id uuid;
    v_old_status text;
    v_node jsonb;
    v_nodes jsonb;
    v_answer jsonb;
    v_has_result boolean := false;
BEGIN
    IF auth.uid() IS NULL OR NOT (public.has_role(auth.uid(), 'leader') OR public.has_role(auth.uid(), 'admin')) THEN
        RAISE EXCEPTION 'Não autorizado.';
    END IF;

    SELECT procedimento_id INTO v_procedimento_id FROM public.procedimento_versoes WHERE id = p_versao_id;
    PERFORM id FROM public.procedimentos WHERE id = v_procedimento_id FOR UPDATE;

    SELECT status, arvore_decisao INTO v_target_status, v_nodes FROM public.procedimento_versoes WHERE id = p_versao_id;
    IF v_target_status != 'draft' THEN RAISE EXCEPTION 'Não é draft.'; END IF;

    IF jsonb_typeof(v_nodes->'nodes') != 'array' OR jsonb_array_length(v_nodes->'nodes') = 0 THEN RAISE EXCEPTION 'Árvore inválida: nodes.'; END IF;
    IF v_nodes->>'startNodeId' IS NULL OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_nodes->'nodes') n WHERE n->>'id' = v_nodes->>'startNodeId') THEN RAISE EXCEPTION 'Árvore inválida: startNodeId.'; END IF;
    FOR v_node IN SELECT * FROM jsonb_array_elements(v_nodes->'nodes') LOOP
        IF v_node->>'type' = 'result' THEN v_has_result := true; IF v_node->>'instruction' IS NULL OR trim(v_node->>'instruction') = '' THEN RAISE EXCEPTION 'Árvore inválida: result sem instrução.'; END IF;
        ELSIF v_node->>'type' = 'question' THEN IF jsonb_typeof(v_node->'answers') != 'array' OR jsonb_array_length(v_node->'answers') = 0 THEN RAISE EXCEPTION 'Árvore inválida: question sem answers.'; END IF;
            FOR v_answer IN SELECT * FROM jsonb_array_elements(v_node->'answers') LOOP IF v_answer->>'nextNodeId' IS NULL OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_nodes->'nodes') next_n WHERE next_n->>'id' = v_answer->>'nextNodeId') THEN RAISE EXCEPTION 'Árvore inválida: nextNodeId inexistente.'; END IF; END LOOP;
        END IF;
    END LOOP;
    IF NOT v_has_result THEN RAISE EXCEPTION 'Árvore inválida: sem result.'; END IF;

    IF p_substitui_versao_id IS NOT NULL THEN
        SELECT procedimento_id, status INTO v_old_procedimento_id, v_old_status FROM public.procedimento_versoes WHERE id = p_substitui_versao_id;
        IF v_old_procedimento_id != v_procedimento_id OR v_old_status != 'published' THEN RAISE EXCEPTION 'Substituição inválida.'; END IF;
        UPDATE public.procedimento_versoes SET vigencia_fim = p_vigencia_inicio WHERE id = p_substitui_versao_id;
    END IF;

    UPDATE public.procedimento_versoes SET
        status = 'published', vigencia_inicio = p_vigencia_inicio, published_at = now(), publicado_por_id = auth.uid(),
        status_updated_at = now(), status_alterado_por_id = auth.uid()
    WHERE id = p_versao_id;

    RETURN p_versao_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 5. RLS Canônica
CREATE POLICY "Equipes veem publicados ativos" ON public.procedimento_versoes FOR SELECT TO authenticated
USING (status = 'published' AND vigencia_inicio <= CURRENT_DATE AND (vigencia_fim IS NULL OR vigencia_fim > CURRENT_DATE));

CREATE POLICY "Líderes e admins veem tudo" ON public.procedimento_versoes FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'leader') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Líderes e admins inserem drafts" ON public.procedimento_versoes FOR INSERT TO authenticated
WITH CHECK ((public.has_role(auth.uid(), 'leader') OR public.has_role(auth.uid(), 'admin')) AND status = 'draft');

CREATE POLICY "Líderes e admins editam drafts" ON public.procedimento_versoes FOR UPDATE TO authenticated
USING ((public.has_role(auth.uid(), 'leader') OR public.has_role(auth.uid(), 'admin')) AND status = 'draft')
WITH CHECK ((public.has_role(auth.uid(), 'leader') OR public.has_role(auth.uid(), 'admin')) AND status = 'draft');

CREATE POLICY "Líderes e admins atualizam status histórico" ON public.procedimento_versoes FOR UPDATE TO authenticated
USING ((public.has_role(auth.uid(), 'leader') OR public.has_role(auth.uid(), 'admin')) AND status IN ('published', 'suspended'))
WITH CHECK ((public.has_role(auth.uid(), 'leader') OR public.has_role(auth.uid(), 'admin')) AND status IN ('published', 'suspended', 'archived'));

CREATE POLICY "Líderes e admins deletam drafts" ON public.procedimento_versoes FOR DELETE TO authenticated
USING ((public.has_role(auth.uid(), 'leader') OR public.has_role(auth.uid(), 'admin')) AND status = 'draft');
