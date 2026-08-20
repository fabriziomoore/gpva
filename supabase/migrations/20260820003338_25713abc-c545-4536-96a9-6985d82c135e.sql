-- Limpeza de triggers duplicados e obsoletos
DROP TRIGGER IF EXISTS trg_procedimento_versao_delete ON public.procedimento_versoes;
DROP TRIGGER IF EXISTS trigger_prevent_versao_deletion ON public.procedimento_versoes;
DROP TRIGGER IF EXISTS trg_procedimento_versao_immutability ON public.procedimento_versoes;
DROP TRIGGER IF EXISTS trigger_enforce_versao_immutability ON public.procedimento_versoes;

-- Criação do schema privado para funções internas, se não existir
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM anon, authenticated;

-- Função interna para encerrar versão substituída
CREATE OR REPLACE FUNCTION private.internal_close_superseded_version(
    p_versao_id UUID,
    p_vigencia_fim TIMESTAMPTZ,
    p_user_id UUID
) RETURNS VOID AS $$
BEGIN
    -- Marca na sessão que estamos em um contexto interno legítimo
    PERFORM set_config('app.internal_mutation', 'true', true);
    
    UPDATE public.procedimento_versoes
    SET 
        vigencia_fim = p_vigencia_fim,
        status_updated_at = now(),
        status_alterado_por_id = p_user_id
    WHERE id = p_versao_id;
    
    -- Reseta a flag
    PERFORM set_config('app.internal_mutation', 'false', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Garantir que ninguém além do dono (superuser) possa chamar diretamente
REVOKE EXECUTE ON FUNCTION private.internal_close_superseded_version FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION private.internal_close_superseded_version FROM authenticated, anon;

-- RPC Pública de Publicação
CREATE OR REPLACE FUNCTION public.publish_procedure_version(
    p_versao_id UUID
) RETURNS JSONB AS $$
DECLARE
    v_versao RECORD;
    v_substituida RECORD;
    v_tree JSONB;
    v_node JSONB;
    v_user_id UUID;
BEGIN
    -- 1. Segurança e Identidade
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501';
    END IF;

    IF NOT public.has_role(v_user_id, 'leader') AND NOT public.has_role(v_user_id, 'admin') THEN
        RAISE EXCEPTION 'Permissão negada: requer role leader ou admin' USING ERRCODE = '42501';
    END IF;

    -- 2. Busca e Lock da versão
    SELECT * INTO v_versao 
    FROM public.procedimento_versoes 
    WHERE id = p_versao_id 
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Versão não encontrada';
    END IF;

    IF v_versao.status != 'draft' THEN
        RAISE EXCEPTION 'Apenas rascunhos podem ser publicados';
    END IF;

    -- 3. Validação de Árvore (Backend)
    v_tree := v_versao.arvore_decisao;
    IF v_tree IS NULL OR v_tree->'nodes' IS NULL OR jsonb_array_length(v_tree->'nodes') = 0 THEN
        RAISE EXCEPTION 'Árvore de decisão inválida ou vazia';
    END IF;

    IF v_tree->>'startNodeId' IS NULL THEN
        RAISE EXCEPTION 'Nó inicial não definido na árvore';
    END IF;

    -- Verifica se todos os nós de pergunta têm pelo menos uma resposta
    FOR v_node IN SELECT * FROM jsonb_array_elements(v_tree->'nodes') LOOP
        IF v_node->>'type' = 'question' THEN
            IF v_node->'answers' IS NULL OR jsonb_array_length(v_node->'answers') = 0 THEN
                RAISE EXCEPTION 'Pergunta "%" está sem respostas', v_node->>'label';
            END IF;
        END IF;
    END LOOP;

    -- 4. Sucessão Cronológica
    IF v_versao.substitui_versao_id IS NOT NULL THEN
        SELECT * INTO v_substituida 
        FROM public.procedimento_versoes 
        WHERE id = v_versao.substitui_versao_id;

        IF FOUND THEN
            IF v_versao.vigencia_inicio <= v_substituida.vigencia_inicio THEN
                RAISE EXCEPTION 'A vigência da nova versão deve iniciar após a versão anterior';
            END IF;

            -- Encerra a anterior via função privada
            PERFORM private.internal_close_superseded_version(
                v_substituida.id,
                v_versao.vigencia_inicio - INTERVAL '1 day',
                v_user_id
            );
        END IF;
    END IF;

    -- 5. Publicação da versão atual
    -- Marca flag interna para permitir o UPDATE de status
    PERFORM set_config('app.internal_mutation', 'true', true);

    UPDATE public.procedimento_versoes
    SET 
        status = 'published',
        published_at = now(),
        publicado_por_id = v_user_id,
        status_updated_at = now(),
        status_alterado_por_id = v_user_id
    WHERE id = p_versao_id;

    PERFORM set_config('app.internal_mutation', 'false', true);

    RETURN jsonb_build_object('success', true, 'id', p_versao_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.publish_procedure_version FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_procedure_version TO authenticated;

-- RLS: Bloqueio de DELETE e UPDATE manual de status
ALTER TABLE public.procedimento_versoes DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.procedimento_versoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Líderes e admins podem deletar rascunhos" ON public.procedimento_versoes;
CREATE POLICY "Líderes e admins podem deletar rascunhos"
ON public.procedimento_versoes
FOR DELETE
TO authenticated
USING (
    (public.has_role(auth.uid(), 'leader') OR public.has_role(auth.uid(), 'admin'))
    AND status = 'draft'
);

-- Política de UPDATE (Bloqueia alteração manual para published)
DROP POLICY IF EXISTS "Líderes e admins podem editar rascunhos" ON public.procedimento_versoes;
CREATE POLICY "Líderes e admins podem editar rascunhos"
ON public.procedimento_versoes
FOR UPDATE
TO authenticated
USING (
    (public.has_role(auth.uid(), 'leader') OR public.has_role(auth.uid(), 'admin'))
    AND status = 'draft'
)
WITH CHECK (
    (public.has_role(auth.uid(), 'leader') OR public.has_role(auth.uid(), 'admin'))
    AND status = 'draft'
);

-- Trigger Canônico de Imutabilidade e Auditoria
CREATE OR REPLACE FUNCTION public.trg_enforce_versao_immutability()
RETURNS TRIGGER AS $$
BEGIN
    -- Se for um UPDATE normal (não via RPC interna)
    IF current_setting('app.internal_mutation', true) IS NULL OR current_setting('app.internal_mutation', true) != 'true' THEN
        -- Bloqueia qualquer alteração em versões não-draft
        IF OLD.status IN ('published', 'suspended', 'archived') THEN
            RAISE EXCEPTION 'Versões publicadas, suspensas ou arquivadas são imutáveis via API';
        END IF;
    ELSE
        -- No contexto interno, apenas vigencia_fim e auditoria podem mudar em versões publicadas
        IF OLD.status = 'published' THEN
            IF NEW.titulo != OLD.titulo OR 
               NEW.arvore_decisao != OLD.arvore_decisao OR 
               NEW.versao != OLD.versao OR
               NEW.procedimento_id != OLD.procedimento_id OR
               NEW.vigencia_inicio != OLD.vigencia_inicio THEN
                RAISE EXCEPTION 'Alteração de conteúdo proibida em sucessão controlada';
            END IF;
        END IF;
    END IF;

    -- Auditoria automática de status
    IF NEW.status != OLD.status THEN
        NEW.status_updated_at = now();
        NEW.status_alterado_por_id = auth.uid();
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_immutability_final ON public.procedimento_versoes;
CREATE TRIGGER trigger_immutability_final
BEFORE UPDATE ON public.procedimento_versoes
FOR EACH ROW EXECUTE FUNCTION public.trg_enforce_versao_immutability();
