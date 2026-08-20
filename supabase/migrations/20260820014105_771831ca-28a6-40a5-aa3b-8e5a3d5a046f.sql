-- MIGRATION DE SANEAMENTO FINAL - FASE 1A
BEGIN;

-- 1. REVOGAÇÃO DE ACESSO PÚBLICO (Remediação Linter 0029)
REVOKE ALL ON FUNCTION public.validate_procedure_tree(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.publish_procedure_version(uuid, date, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_procedure_with_version(text, text, text, text, text, date, date, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.validate_procedure_tree(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_procedure_version(uuid, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_procedure_with_version(text, text, text, text, text, date, date, jsonb) TO authenticated;

-- 2. CONFIGURAÇÃO DE PRIVILÉGIOS DO ROLE INTERNO
GRANT SELECT ON public.procedimentos TO internal_proc_executor;
GRANT UPDATE(id) ON public.procedimentos TO internal_proc_executor; -- Para SELECT FOR UPDATE
GRANT SELECT, INSERT, UPDATE, DELETE ON public.procedimento_versoes TO internal_proc_executor;

-- 3. RLS CANÔNICA (procedimento_versoes)
-- Remove legadas para garantir estado limpo
DROP POLICY IF EXISTS "Enable select for authenticated users" ON public.procedimento_versoes;
DROP POLICY IF EXISTS "Enable insert for leaders and admins" ON public.procedimento_versoes;
DROP POLICY IF EXISTS "Enable update for leaders and admins" ON public.procedimento_versoes;
DROP POLICY IF EXISTS "Enable delete for draft versions" ON public.procedimento_versoes;
DROP POLICY IF EXISTS "versoes_select_policy" ON public.procedimento_versoes;
DROP POLICY IF EXISTS "versoes_insert_draft_policy" ON public.procedimento_versoes;
DROP POLICY IF EXISTS "versoes_update_draft_policy" ON public.procedimento_versoes;
DROP POLICY IF EXISTS "versoes_delete_draft_policy" ON public.procedimento_versoes;

-- RLS: Leitura
CREATE POLICY "canonical_versoes_select" ON public.procedimento_versoes
    FOR SELECT TO authenticated
    USING (true);

-- RLS: Inserção (Apenas Drafts)
CREATE POLICY "canonical_versoes_insert_draft" ON public.procedimento_versoes
    FOR INSERT TO authenticated
    WITH CHECK (
        status = 'draft' AND 
        (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'leader'))
    );

-- RLS: Update (Apenas Drafts)
CREATE POLICY "canonical_versoes_update_draft" ON public.procedimento_versoes
    FOR UPDATE TO authenticated
    USING (
        status = 'draft' AND 
        (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'leader'))
    )
    WITH CHECK (status = 'draft');

-- RLS: Delete (Apenas Drafts)
CREATE POLICY "canonical_versoes_delete_draft" ON public.procedimento_versoes
    FOR DELETE TO authenticated
    USING (
        status = 'draft' AND 
        (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'leader'))
    );

-- 4. VALIDAÇÃO JSONB PROFUNDA E TRIGGERS
CREATE OR REPLACE FUNCTION public.check_procedimento_versao_integrity()
RETURNS TRIGGER AS $$
DECLARE
    v_is_internal BOOLEAN;
    v_tree_valid RECORD;
BEGIN
    v_is_internal := (current_user = 'internal_proc_executor');

    -- BLOQUEIO DE STATUS PUBLISHED VIA API (RLS já deve pegar, mas trigger é backup)
    IF NOT v_is_internal AND NEW.status = 'published' AND (OLD.status IS NULL OR OLD.status != 'published') THEN
        RAISE EXCEPTION 'Publicação permitida apenas via API oficial de publicação.';
    END IF;

    -- TRILHA INTERNA (PUBLICAÇÃO/SUCESSÃO)
    IF v_is_internal THEN
        -- CASO A: Publicação de Draft -> Published
        IF OLD.status = 'draft' AND NEW.status = 'published' THEN
            -- Campos permitidos mudar: status, published_at, publicado_por_id, status_updated_at, status_alterado_por_id, vigencia_inicio, vigencia_fim
            -- Todo o resto deve ser igual
            IF (OLD.titulo != NEW.titulo OR OLD.categoria != NEW.categoria OR OLD.arvore_decisao::text != NEW.arvore_decisao::text) THEN
                RAISE EXCEPTION 'Alteração de conteúdo proibida durante publicação.';
            END IF;
        
        -- CASO B: Sucessão (Fechamento de vigência)
        ELSIF OLD.status = 'published' AND NEW.status = 'published' THEN
            -- APENAS vigencia_fim pode mudar
            IF (OLD.titulo != NEW.titulo OR OLD.arvore_decisao::text != NEW.arvore_decisao::text OR OLD.published_at != NEW.published_at) THEN
                RAISE EXCEPTION 'Apenas vigencia_fim pode ser alterada em versões já publicadas.';
            END IF;
        END IF;
    END IF;

    -- VALIDAÇÃO DA ÁRVORE (Se mudou)
    IF (TG_OP = 'INSERT' OR OLD.arvore_decisao::text != NEW.arvore_decisao::text) THEN
        v_tree_valid := public.validate_procedure_tree(NEW.arvore_decisao);
        IF NOT (v_tree_valid.valid) THEN
             RAISE EXCEPTION 'Estrutura da árvore inválida: %', v_tree_valid.errors;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 5. RE-APLICAÇÃO DOS TRIGGERS
DROP TRIGGER IF EXISTS trg_procedimento_versao_integrity ON public.procedimento_versoes;
CREATE TRIGGER trg_procedimento_versao_integrity
    BEFORE INSERT OR UPDATE ON public.procedimento_versoes
    FOR EACH ROW EXECUTE FUNCTION public.check_procedimento_versao_integrity();

COMMIT;