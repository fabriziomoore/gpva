-- 1. Redefinição de Privilégios Mínimos e Ownership
-- O usuário da migração em Lovable Cloud pode ter restrições em ALTER OWNER.
-- Vamos focar nos GRANTs que não dependem de ownership se o objeto já existe.

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'internal_proc_executor') THEN
        CREATE ROLE internal_proc_executor WITH NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION BYPASSRLS;
    END IF;
END
$$;

-- Privilégios mínimos para a role interna
GRANT USAGE ON SCHEMA public TO internal_proc_executor;
GRANT SELECT ON public.procedimentos TO internal_proc_executor;
GRANT UPDATE(id) ON public.procedimentos TO internal_proc_executor;
GRANT SELECT, UPDATE ON public.procedimento_versoes TO internal_proc_executor;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO internal_proc_executor;

-- 2. Reforço do Trigger de Imutabilidade (Matriz Canônica)
CREATE OR REPLACE FUNCTION public.check_procedimento_versao_integrity()
RETURNS TRIGGER AS $$
DECLARE
    is_internal boolean;
BEGIN
    -- Detecta se a operação está vindo da RPC privilegiada via current_user
    is_internal := (current_user = 'internal_proc_executor');

    -- TRILHA INTERNA
    IF is_internal THEN
        -- CASO A: Publicação (draft -> published)
        IF OLD.status = 'draft' AND NEW.status = 'published' THEN
            IF (OLD.procedimento_id != NEW.procedimento_id OR 
                OLD.versao != NEW.versao OR 
                OLD.arvore_decisao != NEW.arvore_decisao OR 
                OLD.categoria != NEW.categoria OR 
                OLD.setor != NEW.setor OR 
                OLD.fonte != NEW.fonte) THEN
                RAISE EXCEPTION 'Trilha Interna (Caso A): Proibido alterar conteúdo operacional durante a publicação.';
            END IF;
            RETURN NEW;
        END IF;

        -- CASO B: Sucessão (published -> published)
        IF OLD.status = 'published' AND NEW.status = 'published' THEN
            -- ÚNICO campo alterável: vigencia_fim
            IF (OLD.procedimento_id != NEW.procedimento_id OR 
                OLD.arvore_decisao != NEW.arvore_decisao OR 
                OLD.status != NEW.status OR 
                OLD.published_at != NEW.published_at OR 
                OLD.publicado_por_id != NEW.publicado_por_id OR 
                OLD.status_updated_at != NEW.status_updated_at OR 
                OLD.status_alterado_por_id != NEW.status_alterado_por_id OR
                OLD.versao != NEW.versao OR
                OLD.categoria != NEW.categoria OR
                OLD.setor != NEW.setor) THEN
                RAISE EXCEPTION 'Trilha Interna (Caso B): Apenas vigencia_fim pode ser alterado durante a sucessão.';
            END IF;
            RETURN NEW;
        END IF;
        
        RAISE EXCEPTION 'Trilha Interna: Transição de status não autorizada (Identity Bypass).';
    END IF;

    -- TRILHA NORMAL (API)
    IF NOT is_internal THEN
        -- Bloqueia alteração de conteúdo em qualquer versão não-draft
        IF OLD.status != 'draft' AND (
            OLD.procedimento_id != NEW.procedimento_id OR 
            OLD.arvore_decisao != NEW.arvore_decisao OR 
            OLD.categoria != NEW.categoria OR 
            OLD.setor != NEW.setor OR 
            OLD.fonte != NEW.fonte OR
            OLD.versao != NEW.versao OR
            OLD.vigencia_inicio != NEW.vigencia_inicio OR
            OLD.vigencia_fim != NEW.vigencia_fim
        ) THEN
            RAISE EXCEPTION 'Trilha Normal: Alteração de conteúdo operacional ou vigência proibida em versões publicadas/históricas.';
        END IF;

        -- Matriz de Transições de Status (Leader/Admin)
        IF OLD.status = 'published' AND NEW.status NOT IN ('suspended', 'archived') THEN
            RAISE EXCEPTION 'Trilha Normal: published só pode transicionar para suspended ou archived.';
        END IF;
        IF OLD.status = 'suspended' AND NEW.status != 'archived' THEN
            RAISE EXCEPTION 'Trilha Normal: suspended só pode transicionar para archived.';
        END IF;
        IF OLD.status = 'archived' THEN
            RAISE EXCEPTION 'Trilha Normal: Status archived é terminal.';
        END IF;
        
        -- Auditoria preenchida obrigatoriamente
        NEW.status_updated_at := now();
        NEW.status_alterado_por_id := auth.uid();
        
        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. Reforço da RPC (Lock e Validação JSONB)
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
    -- A RPC deve ser executada como a role privilegiada
    -- Isso garante que o trigger identifique como Trilha Interna
    SET ROLE internal_proc_executor;

    -- 1. Validação de Auth e Role (Non-falsifiable)
    IF auth.uid() IS NULL OR NOT (public.has_role(auth.uid(), 'leader') OR public.has_role(auth.uid(), 'admin')) THEN
        RESET ROLE;
        RAISE EXCEPTION 'Não autorizado: Requer autenticação e role leader ou admin.';
    END IF;

    -- 2. Localização e Lock Serializado no Procedimento Pai
    SELECT procedimento_id INTO v_procedimento_id FROM public.procedimento_versoes WHERE id = p_versao_id;
    IF v_procedimento_id IS NULL THEN 
        RESET ROLE;
        RAISE EXCEPTION 'Versão não encontrada.'; 
    END IF;
    
    PERFORM id FROM public.procedimentos WHERE id = v_procedimento_id FOR UPDATE;

    -- 3. Reler e Validar Versão Alvo (Draft)
    SELECT status, arvore_decisao INTO v_target_status, v_nodes FROM public.procedimento_versoes WHERE id = p_versao_id;
    IF v_target_status != 'draft' THEN 
        RESET ROLE;
        RAISE EXCEPTION 'Somente rascunhos podem ser publicados.'; 
    END IF;

    -- 4. Validação JSONB rigorosa no Backend
    IF jsonb_typeof(v_nodes) != 'object' THEN RESET ROLE; RAISE EXCEPTION 'Árvore inválida: deve ser um objeto.'; END IF;
    IF jsonb_typeof(v_nodes->'nodes') != 'array' OR jsonb_array_length(v_nodes->'nodes') = 0 THEN 
        RESET ROLE;
        RAISE EXCEPTION 'Árvore inválida: nodes deve ser um array não vazio.'; 
    END IF;
    
    IF v_nodes->>'startNodeId' IS NULL OR trim(v_nodes->>'startNodeId') = '' THEN 
        RESET ROLE;
        RAISE EXCEPTION 'Árvore inválida: startNodeId obrigatório.'; 
    END IF;

    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_nodes->'nodes') n WHERE n->>'id' = v_nodes->>'startNodeId') THEN
        RESET ROLE;
        RAISE EXCEPTION 'Árvore inválida: startNodeId não corresponde a nenhum node.';
    END IF;

    FOR v_node IN SELECT * FROM jsonb_array_elements(v_nodes->'nodes') LOOP
        IF v_node->>'id' IS NULL OR trim(v_node->>'id') = '' THEN RESET ROLE; RAISE EXCEPTION 'Árvore inválida: node sem ID.'; END IF;
        
        IF v_node->>'type' = 'result' THEN
            v_has_result := true;
            IF v_node->>'instruction' IS NULL OR trim(v_node->>'instruction') = '' THEN
                RESET ROLE;
                RAISE EXCEPTION 'Árvore inválida: node result deve ter instruction.';
            END IF;
        ELSIF v_node->>'type' = 'question' THEN
            IF jsonb_typeof(v_node->'answers') != 'array' OR jsonb_array_length(v_node->'answers') = 0 THEN
                RESET ROLE;
                RAISE EXCEPTION 'Árvore inválida: question sem answers.';
            END IF;
            FOR v_answer IN SELECT * FROM jsonb_array_elements(v_node->'answers') LOOP
                IF v_answer->>'nextNodeId' IS NULL OR trim(v_answer->>'nextNodeId') = '' THEN
                    RESET ROLE;
                    RAISE EXCEPTION 'Árvore inválida: answer sem nextNodeId.';
                END IF;
                IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_nodes->'nodes') next_n WHERE next_n->>'id' = v_answer->>'nextNodeId') THEN
                    RESET ROLE;
                    RAISE EXCEPTION 'Árvore inválida: nextNodeId inexistente.';
                END IF;
            END LOOP;
        END IF;
    END LOOP;

    IF NOT v_has_result THEN RESET ROLE; RAISE EXCEPTION 'Árvore inválida: requer ao menos um node type=result.'; END IF;

    -- 5. Fechar Predecessor (Sucessão)
    IF p_substitui_versao_id IS NOT NULL THEN
        SELECT procedimento_id, status INTO v_old_procedimento_id, v_old_status 
        FROM public.procedimento_versoes 
        WHERE id = p_substitui_versao_id;
        
        IF v_old_procedimento_id != v_procedimento_id THEN
            RESET ROLE;
            RAISE EXCEPTION 'Sucessão inválida: versão substituída pertence a outro procedimento.';
        END IF;
        
        IF v_old_status != 'published' THEN
            RESET ROLE;
            RAISE EXCEPTION 'Sucessão inválida: apenas versões publicadas podem ser substituídas.';
        END IF;

        -- Trilha Interna Caso B: Apenas vigencia_fim muda
        UPDATE public.procedimento_versoes 
        SET vigencia_fim = p_vigencia_inicio 
        WHERE id = p_substitui_versao_id;
    END IF;

    -- 6. Publicar Sucessora (Atomicidade)
    -- Trilha Interna Caso A: Publicação draft -> published
    UPDATE public.procedimento_versoes SET
        status = 'published',
        vigencia_inicio = p_vigencia_inicio,
        published_at = now(),
        publicado_por_id = auth.uid(),
        status_updated_at = now(),
        status_alterado_por_id = auth.uid()
    WHERE id = p_versao_id;

    RESET ROLE;
    RETURN p_versao_id;
EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Revoga acesso público e garante acesso ao usuário autenticado
REVOKE ALL ON FUNCTION public.publish_procedure_version(uuid, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_procedure_version(uuid, date, uuid) TO authenticated;

-- 4. RLS Canônica Final (procedimento_versoes)
DROP POLICY IF EXISTS "Equipes veem publicados ativos" ON public.procedimento_versoes;
DROP POLICY IF EXISTS "Líderes e admins veem tudo" ON public.procedimento_versoes;
DROP POLICY IF EXISTS "Líderes e admins inserem drafts" ON public.procedimento_versoes;
DROP POLICY IF EXISTS "Líderes e admins editam drafts" ON public.procedimento_versoes;
DROP POLICY IF EXISTS "Líderes e admins atualizam status histórico" ON public.procedimento_versoes;
DROP POLICY IF EXISTS "Líderes e admins deletam drafts" ON public.procedimento_versoes;

CREATE POLICY "Equipes veem publicados ativos" ON public.procedimento_versoes
FOR SELECT TO authenticated
USING (
    status = 'published' 
    AND vigencia_inicio <= CURRENT_DATE 
    AND (vigencia_fim IS NULL OR vigencia_fim > CURRENT_DATE)
);

CREATE POLICY "Líderes e admins veem tudo" ON public.procedimento_versoes
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'leader') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Líderes e admins inserem drafts" ON public.procedimento_versoes
FOR INSERT TO authenticated
WITH CHECK (
    (public.has_role(auth.uid(), 'leader') OR public.has_role(auth.uid(), 'admin'))
    AND status = 'draft'
);

CREATE POLICY "Líderes e admins editam drafts" ON public.procedimento_versoes
FOR UPDATE TO authenticated
USING (
    (public.has_role(auth.uid(), 'leader') OR public.has_role(auth.uid(), 'admin'))
    AND status = 'draft'
)
WITH CHECK (
    (public.has_role(auth.uid(), 'leader') OR public.has_role(auth.uid(), 'admin'))
    AND status = 'draft'
);

CREATE POLICY "Líderes e admins atualizam status histórico" ON public.procedimento_versoes
FOR UPDATE TO authenticated
USING (
    (public.has_role(auth.uid(), 'leader') OR public.has_role(auth.uid(), 'admin'))
    AND status IN ('published', 'suspended')
)
WITH CHECK (
    (public.has_role(auth.uid(), 'leader') OR public.has_role(auth.uid(), 'admin'))
    AND status IN ('published', 'suspended', 'archived')
);

CREATE POLICY "Líderes e admins deletam drafts" ON public.procedimento_versoes
FOR DELETE TO authenticated
USING (
    (public.has_role(auth.uid(), 'leader') OR public.has_role(auth.uid(), 'admin'))
    AND status = 'draft'
);
