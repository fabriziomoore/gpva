-- FASE 1A: SANEAMENTO DE PROCEDIMENTOS (CORREÇÃO CIRÚRGICA)
BEGIN;

-- 1. IDENTIDADE INTERNA
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'internal_proc_executor') THEN
        CREATE ROLE internal_proc_executor WITH NOLOGIN NOINHERIT BYPASSRLS;
    END IF;
END $$;

-- Garantir privilégios mínimos
GRANT USAGE ON SCHEMA public TO internal_proc_executor;
GRANT SELECT ON public.user_roles TO internal_proc_executor;
GRANT SELECT ON public.procedimento_versoes TO internal_proc_executor;
GRANT UPDATE ON public.procedimento_versoes TO internal_proc_executor;
GRANT SELECT ON public.procedimentos TO internal_proc_executor;
GRANT UPDATE (id) ON public.procedimentos TO internal_proc_executor;

-- 2. LIMPEZA DE LEGADOS (DROPS NOMINAIS)
DROP TRIGGER IF EXISTS trigger_immutability_final ON public.procedimento_versoes;
DROP TRIGGER IF EXISTS trg_procedimento_versao_integrity ON public.procedimento_versoes;
DROP TRIGGER IF EXISTS trg_procedimento_versao_delete_historical ON public.procedimento_versoes;
DROP TRIGGER IF EXISTS trg_procedimento_versao_integrity_v2 ON public.procedimento_versoes;
DROP TRIGGER IF EXISTS trigger_enforce_versao_immutability ON public.procedimento_versoes;
DROP TRIGGER IF EXISTS trg_procedimento_versao_delete_historical_v2 ON public.procedimento_versoes;

DROP FUNCTION IF EXISTS public.publish_procedure_version(uuid);
DROP FUNCTION IF EXISTS public.publish_procedure_version(uuid, date);
DROP FUNCTION IF EXISTS public.trg_enforce_versao_immutability();
DROP FUNCTION IF EXISTS public.check_procedimento_versao_integrity();
DROP FUNCTION IF EXISTS public.prevent_procedimento_versao_historical_delete();
DROP FUNCTION IF EXISTS private.internal_close_superseded_version(uuid, date);

-- 3. VALIDACÃO JSONB
CREATE OR REPLACE FUNCTION public.validate_procedure_tree(p_tree jsonb)
RETURNS boolean AS $$
DECLARE
    v_node jsonb;
    v_answer jsonb;
    v_node_ids text[];
    v_node_id text;
    v_start_node_id text;
    v_has_result boolean := false;
BEGIN
    IF jsonb_typeof(p_tree) <> 'object' THEN RETURN false; END IF;
    IF NOT (p_tree ? 'nodes') OR jsonb_typeof(p_tree->'nodes') <> 'array' THEN RETURN false; END IF;
    IF jsonb_array_length(p_tree->'nodes') = 0 THEN RETURN false; END IF;
    
    v_start_node_id := p_tree->>'startNodeId';
    IF v_start_node_id IS NULL OR v_start_node_id = '' THEN RETURN false; END IF;

    FOR v_node IN SELECT * FROM jsonb_array_elements(p_tree->'nodes') LOOP
        v_node_id := v_node->>'id';
        IF v_node_id IS NULL OR v_node_id = '' THEN RETURN false; END IF;
        IF v_node_id = ANY(v_node_ids) THEN RETURN false; END IF;
        v_node_ids := array_append(v_node_ids, v_node_id);

        IF v_node->>'type' = 'result' THEN
            v_has_result := true;
            IF v_node->>'instruction' IS NULL OR v_node->>'instruction' = '' THEN RETURN false; END IF;
        ELSIF v_node->>'type' = 'question' THEN
            IF NOT (v_node ? 'answers') OR jsonb_typeof(v_node->'answers') <> 'array' OR jsonb_array_length(v_node->'answers') = 0 THEN
                RETURN false;
            END IF;
            FOR v_answer IN SELECT * FROM jsonb_array_elements(v_node->'answers') LOOP
                IF v_answer->>'nextNodeId' IS NULL OR v_answer->>'nextNodeId' = '' THEN RETURN false; END IF;
            END LOOP;
        END IF;
    END LOOP;

    IF NOT EXISTS (SELECT 1 FROM unnest(v_node_ids) as id WHERE id = v_start_node_id) THEN RETURN false; END IF;
    IF NOT v_has_result THEN RETURN false; END IF;

    FOR v_node IN SELECT * FROM jsonb_array_elements(p_tree->'nodes') LOOP
        IF v_node->>'type' = 'question' THEN
            FOR v_answer IN SELECT * FROM jsonb_array_elements(v_node->'answers') LOOP
                IF NOT EXISTS (SELECT 1 FROM unnest(v_node_ids) as id WHERE id = v_answer->>'nextNodeId') THEN
                    RETURN false;
                END IF;
            END LOOP;
        END IF;
    END LOOP;

    RETURN true;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 4. RPC CANÔNICA
CREATE OR REPLACE FUNCTION public.publish_procedure_version(
    p_versao_id uuid, 
    p_vigencia_inicio date, 
    p_substitui_versao_id uuid DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
    v_proc_id uuid;
    v_draft record;
    v_predecessor record;
    v_user_id uuid;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
    IF NOT (public.has_role(v_user_id, 'leader') OR public.has_role(v_user_id, 'admin')) THEN
        RAISE EXCEPTION 'Acesso negado';
    END IF;

    SELECT procedimento_id INTO v_proc_id FROM public.procedimento_versoes WHERE id = p_versao_id;
    IF v_proc_id IS NULL THEN RAISE EXCEPTION 'Versão não encontrada'; END IF;

    PERFORM 1 FROM public.procedimentos WHERE id = v_proc_id FOR UPDATE;

    SELECT * INTO v_draft FROM public.procedimento_versoes WHERE id = p_versao_id;
    IF v_draft.status <> 'draft' THEN RAISE EXCEPTION 'Somente rascunhos podem ser publicados'; END IF;

    IF v_draft.vigencia_inicio <> p_vigencia_inicio THEN RAISE EXCEPTION 'Vigência diverge'; END IF;
    IF COALESCE(v_draft.substitui_versao_id, '00000000-0000-0000-0000-000000000000'::uuid) <> COALESCE(p_substitui_versao_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
        RAISE EXCEPTION 'Relação de sucessão inválida';
    END IF;

    IF NOT public.validate_procedure_tree(v_draft.arvore_decisao) THEN RAISE EXCEPTION 'Árvore inválida'; END IF;

    IF v_draft.substitui_versao_id IS NOT NULL THEN
        SELECT * INTO v_predecessor FROM public.procedimento_versoes WHERE id = v_draft.substitui_versao_id;
        IF v_predecessor.procedimento_id <> v_proc_id OR v_predecessor.status <> 'published' THEN RAISE EXCEPTION 'Predecessor inválido'; END IF;
        IF v_draft.vigencia_inicio <= v_predecessor.vigencia_inicio THEN RAISE EXCEPTION 'Nova vigência deve ser posterior'; END IF;
        
        -- Lock identities durante transação SECURITY DEFINER
        UPDATE public.procedimento_versoes SET vigencia_fim = v_draft.vigencia_inicio WHERE id = v_predecessor.id;
    END IF;

    UPDATE public.procedimento_versoes 
    SET status = 'published', published_at = now(), publicado_por_id = v_user_id, status_updated_at = now(), status_alterado_por_id = v_user_id
    WHERE id = v_draft.id;

    RETURN v_draft.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Tentar ALTER OWNER (silencioso se falhar, preservando a RPC)
DO $$
BEGIN
    ALTER FUNCTION public.publish_procedure_version(uuid, date, uuid) OWNER TO internal_proc_executor;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

REVOKE ALL ON FUNCTION public.publish_procedure_version(uuid, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_procedure_version(uuid, date, uuid) TO authenticated;

-- 5. TRIGGER INTEGRIDADE
CREATE OR REPLACE FUNCTION public.check_procedimento_versao_integrity()
RETURNS trigger AS $$
BEGIN
    -- Caso a publicação venha da identidade interna
    IF CURRENT_USER = 'internal_proc_executor' THEN
        RETURN NEW;
    END IF;

    -- Proteção contra API
    IF OLD.status <> 'draft' THEN
        IF NEW.status IN ('suspended', 'archived') AND OLD.status IN ('published', 'suspended') THEN
            IF (NEW.titulo IS DISTINCT FROM OLD.titulo) OR (NEW.arvore_decisao IS DISTINCT FROM OLD.arvore_decisao) OR (NEW.vigencia_inicio IS DISTINCT FROM OLD.vigencia_inicio) OR (NEW.vigencia_fim IS DISTINCT FROM OLD.vigencia_fim) THEN
                RAISE EXCEPTION 'Imutabilidade violada: Não é permitido alterar conteúdo de versões publicadas';
            END IF;
            NEW.status_updated_at := now();
            NEW.status_alterado_por_id := auth.uid();
            RETURN NEW;
        END IF;
        RAISE EXCEPTION 'Operação não permitida via API para o status %', OLD.status;
    END IF;

    IF NEW.status = 'published' THEN
        RAISE EXCEPTION 'Publicação permitida apenas via RPC dedicada';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_procedimento_versao_integrity
BEFORE UPDATE ON public.procedimento_versoes
FOR EACH ROW EXECUTE FUNCTION public.check_procedimento_versao_integrity();

-- 6. TRIGGER DELETE
CREATE OR REPLACE FUNCTION public.prevent_procedimento_versao_historical_delete()
RETURNS trigger AS $$
BEGIN
    IF OLD.status <> 'draft' THEN
        RAISE EXCEPTION 'Proibido deletar versões publicadas ou arquivadas';
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_procedimento_versao_delete_historical
BEFORE DELETE ON public.procedimento_versoes
FOR EACH ROW EXECUTE FUNCTION public.prevent_procedimento_versao_historical_delete();

-- 7. RLS SANEAMENTO
DO $$
DECLARE
    pol record;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'procedimento_versoes' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.procedimento_versoes', pol.policyname);
    END LOOP;
END $$;

ALTER TABLE public.procedimento_versoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Equipes veem publicados ativos" ON public.procedimento_versoes FOR SELECT TO authenticated USING (status = 'published' AND vigencia_inicio <= CURRENT_DATE AND (vigencia_fim IS NULL OR vigencia_fim > CURRENT_DATE));
CREATE POLICY "Líderes e admins veem tudo" ON public.procedimento_versoes FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'leader') OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Líderes e admins inserem drafts" ON public.procedimento_versoes FOR INSERT TO authenticated WITH CHECK ((public.has_role(auth.uid(), 'leader') OR public.has_role(auth.uid(), 'admin')) AND status = 'draft');
CREATE POLICY "Líderes e admins editam drafts" ON public.procedimento_versoes FOR UPDATE TO authenticated USING ((public.has_role(auth.uid(), 'leader') OR public.has_role(auth.uid(), 'admin')) AND status = 'draft') WITH CHECK ((public.has_role(auth.uid(), 'leader') OR public.has_role(auth.uid(), 'admin')) AND status = 'draft');
CREATE POLICY "Líderes e admins atualizam status histórico" ON public.procedimento_versoes FOR UPDATE TO authenticated USING ((public.has_role(auth.uid(), 'leader') OR public.has_role(auth.uid(), 'admin')) AND status IN ('published', 'suspended')) WITH CHECK ((public.has_role(auth.uid(), 'leader') OR public.has_role(auth.uid(), 'admin')) AND status IN ('published', 'suspended', 'archived'));
CREATE POLICY "Líderes e admins deletam drafts" ON public.procedimento_versoes FOR DELETE TO authenticated USING ((public.has_role(auth.uid(), 'leader') OR public.has_role(auth.uid(), 'admin')) AND status = 'draft');

COMMIT;