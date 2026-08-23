-- 1. Refatorar a função de sobreposição temporal com semântica [start, end)
CREATE OR REPLACE FUNCTION public.check_vigencia_overlap()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
    IF NEW.status = 'published' THEN
        IF EXISTS (
            SELECT 1 FROM public.procedimento_versoes
            WHERE procedimento_id = NEW.procedimento_id
              AND status = 'published'
              AND id IS DISTINCT FROM NEW.id
              AND (
                NEW.vigencia_inicio < COALESCE(vigencia_fim, DATE '9999-12-31')
                AND vigencia_inicio < COALESCE(NEW.vigencia_fim, DATE '9999-12-31')
              )
        ) THEN
            RAISE EXCEPTION 'Já existe uma versão publicada para este procedimento com vigência sobreposta.';
        END IF;
    END IF;
    RETURN NEW;
END;
$function$;

-- 2. Refatorar a RPC de publicação com lock e atomicidade
CREATE OR REPLACE FUNCTION public.publish_procedure_version(p_versao_id uuid, p_vigencia_inicio date, p_substitui_versao_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_proc_id uuid;
    v_draft record;
    v_predecessor record;
    v_user_id uuid;
BEGIN
    -- A. AUTENTICAÇÃO E AUTORIZAÇÃO
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
    IF NOT (public.has_role(v_user_id, 'leader') OR public.has_role(v_user_id, 'admin')) THEN
        RAISE EXCEPTION 'Acesso negado';
    END IF;

    -- B. OBTENÇÃO DO PAI E SERIALIZAÇÃO
    SELECT procedimento_id INTO v_proc_id FROM public.procedimento_versoes WHERE id = p_versao_id;
    IF v_proc_id IS NULL THEN RAISE EXCEPTION 'Versão não encontrada'; END IF;

    -- Lock exclusivo do pai para serializar publicações concorrentes
    PERFORM 1 FROM public.procedimentos WHERE id = v_proc_id FOR UPDATE;

    -- C. RELEITURA PÓS-LOCK
    SELECT * INTO v_draft FROM public.procedimento_versoes WHERE id = p_versao_id;
    
    -- D. VALIDAÇÃO DE STATUS
    IF v_draft.status IS DISTINCT FROM 'draft' THEN 
        RAISE EXCEPTION 'Somente rascunhos podem ser publicados. Status atual: %', v_draft.status; 
    END IF;

    -- E. VALIDAR SOURCE OF TRUTH (VIGÊNCIA E SUCESSÃO)
    IF v_draft.vigencia_inicio IS DISTINCT FROM p_vigencia_inicio THEN 
        RAISE EXCEPTION 'Vigência de início diverge do rascunho'; 
    END IF;
    
    IF v_draft.substitui_versao_id IS DISTINCT FROM p_substitui_versao_id THEN
        RAISE EXCEPTION 'Relação de sucessão diverge do rascunho';
    END IF;

    -- F. VALIDAÇÃO DA ÁRVORE
    IF NOT public.validate_procedure_tree(v_draft.arvore_decisao) THEN 
        RAISE EXCEPTION 'Estrutura da árvore de decisão é inválida'; 
    END IF;

    -- G. GESTÃO DE PREDECESSOR (SUCESSÃO)
    IF v_draft.substitui_versao_id IS NOT NULL THEN
        -- Lock do predecessor
        SELECT * INTO v_predecessor FROM public.procedimento_versoes 
        WHERE id = v_draft.substitui_versao_id FOR UPDATE;
        
        IF NOT FOUND THEN RAISE EXCEPTION 'Predecessor não encontrado'; END IF;
        
        IF v_predecessor.procedimento_id IS DISTINCT FROM v_proc_id THEN 
            RAISE EXCEPTION 'Predecessor pertence a outro procedimento'; 
        END IF;
        
        IF v_predecessor.status IS DISTINCT FROM 'published' THEN 
            RAISE EXCEPTION 'Predecessor deve estar publicado para ser substituído'; 
        END IF;
        
        IF v_draft.vigencia_inicio <= v_predecessor.vigencia_inicio THEN 
            RAISE EXCEPTION 'Nova vigência deve ser estritamente posterior à do predecessor'; 
        END IF;

        IF v_predecessor.vigencia_fim IS NOT NULL AND v_predecessor.vigencia_fim <= v_draft.vigencia_inicio THEN
            RAISE EXCEPTION 'Intervalo do predecessor já encerrado ou incompatível';
        END IF;
        
        -- FECHAMENTO ATÔMICO DO PREDECESSOR
        UPDATE public.procedimento_versoes 
        SET vigencia_fim = v_draft.vigencia_inicio 
        WHERE id = v_predecessor.id;
    ELSE
        -- H. SEM PREDECESSOR: VALIDAR CONFLITOS GERAIS
        IF EXISTS (
            SELECT 1 FROM public.procedimento_versoes
            WHERE procedimento_id = v_proc_id
              AND status = 'published'
              AND (
                v_draft.vigencia_inicio < COALESCE(vigencia_fim, DATE '9999-12-31')
                AND vigencia_inicio < COALESCE(v_draft.vigencia_fim, DATE '9999-12-31')
              )
        ) THEN
            RAISE EXCEPTION 'Conflito temporal detectado com versão já publicada';
        END IF;
    END IF;

    -- I. PUBLICAÇÃO DO SUCESSOR (DRAFT -> PUBLISHED)
    UPDATE public.procedimento_versoes 
    SET 
        status = 'published', 
        published_at = now(), 
        publicado_por_id = v_user_id, 
        status_updated_at = now(), 
        status_alterado_por_id = v_user_id
    WHERE id = v_draft.id;

    RETURN v_draft.id;
END;
$function$;

-- 3. Refatorar a Trigger de Integridade para suportar as exceções formatadas
CREATE OR REPLACE FUNCTION public.check_procedimento_versao_integrity()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- A. INSERT
    IF (TG_OP = 'INSERT') THEN
        IF NOT public.validate_procedure_tree(NEW.arvore_decisao) THEN
            RAISE EXCEPTION 'Estrutura da árvore inválida';
        END IF;
        RETURN NEW;
    END IF;

    -- B. UPDATE
    IF (TG_OP = 'UPDATE') THEN
        -- CASO A: FECHAMENTO DE PREDECESSOR (published -> published)
        -- Somente vigencia_fim pode mudar
        IF OLD.status = 'published' AND NEW.status = 'published' THEN
            IF NEW.vigencia_fim IS DISTINCT FROM OLD.vigencia_fim THEN
                IF (
                    NEW.id IS DISTINCT FROM OLD.id OR
                    NEW.procedimento_id IS DISTINCT FROM OLD.procedimento_id OR
                    NEW.versao IS DISTINCT FROM OLD.versao OR
                    NEW.substitui_versao_id IS DISTINCT FROM OLD.substitui_versao_id OR
                    NEW.titulo IS DISTINCT FROM OLD.titulo OR
                    NEW.categoria IS DISTINCT FROM OLD.categoria OR
                    NEW.descricao IS DISTINCT FROM OLD.descricao OR
                    NEW.setor IS DISTINCT FROM OLD.setor OR
                    NEW.vigencia_inicio IS DISTINCT FROM OLD.vigencia_inicio OR
                    NEW.fonte IS DISTINCT FROM OLD.fonte OR
                    NEW.arvore_decisao IS DISTINCT FROM OLD.arvore_decisao OR
                    NEW.criado_por_id IS DISTINCT FROM OLD.criado_por_id OR
                    NEW.publicado_por_id IS DISTINCT FROM OLD.publicado_por_id OR
                    NEW.created_at IS DISTINCT FROM OLD.created_at OR
                    NEW.updated_at IS DISTINCT FROM OLD.updated_at OR
                    NEW.published_at IS DISTINCT FROM OLD.published_at OR
                    NEW.status_updated_at IS DISTINCT FROM OLD.status_updated_at OR
                    NEW.status_alterado_por_id IS DISTINCT FROM OLD.status_alterado_por_id
                ) THEN
                    RAISE EXCEPTION 'Somente vigencia_fim pode ser alterada no fechamento de versão publicada';
                END IF;

                IF NEW.vigencia_fim IS NULL OR NEW.vigencia_fim <= OLD.vigencia_inicio THEN
                    RAISE EXCEPTION 'vigencia_fim inválida no fechamento';
                END IF;

                RETURN NEW;
            END IF;
            RAISE EXCEPTION 'Transição published -> published exige alteração de vigencia_fim';
        END IF;

        -- CASO B: PUBLICAÇÃO DE DRAFT (draft -> published)
        -- Somente 5 campos de status/publicação podem mudar
        IF OLD.status = 'draft' AND NEW.status = 'published' THEN
            IF (
                NEW.id IS DISTINCT FROM OLD.id OR
                NEW.procedimento_id IS DISTINCT FROM OLD.procedimento_id OR
                NEW.versao IS DISTINCT FROM OLD.versao OR
                NEW.substitui_versao_id IS DISTINCT FROM OLD.substitui_versao_id OR
                NEW.titulo IS DISTINCT FROM OLD.titulo OR
                NEW.categoria IS DISTINCT FROM OLD.categoria OR
                NEW.descricao IS DISTINCT FROM OLD.descricao OR
                NEW.setor IS DISTINCT FROM OLD.setor OR
                NEW.vigencia_inicio IS DISTINCT FROM OLD.vigencia_inicio OR
                NEW.vigencia_fim IS DISTINCT FROM OLD.vigencia_fim OR
                NEW.fonte IS DISTINCT FROM OLD.fonte OR
                NEW.arvore_decisao IS DISTINCT FROM OLD.arvore_decisao OR
                NEW.criado_por_id IS DISTINCT FROM OLD.criado_por_id OR
                NEW.created_at IS DISTINCT FROM OLD.created_at OR
                NEW.updated_at IS DISTINCT FROM OLD.updated_at
            ) THEN
                RAISE EXCEPTION 'Alteração de campos imutáveis durante a publicação do rascunho';
            END IF;

            IF NEW.published_at IS NULL OR NEW.publicado_por_id IS NULL OR 
               NEW.status_updated_at IS NULL OR NEW.status_alterado_por_id IS NULL THEN
                RAISE EXCEPTION 'Metadados de publicação incompletos';
            END IF;

            -- Revalidar árvore na publicação
            IF NOT public.validate_procedure_tree(NEW.arvore_decisao) THEN
                RAISE EXCEPTION 'Estrutura da árvore inválida na publicação';
            END IF;

            RETURN NEW;
        END IF;

        -- REGRAS ORIGINAIS MANTIDAS
        -- draft -> draft
        IF OLD.status = 'draft' AND NEW.status = 'draft' THEN
            IF NEW.arvore_decisao IS DISTINCT FROM OLD.arvore_decisao THEN
                IF NOT public.validate_procedure_tree(NEW.arvore_decisao) THEN
                    RAISE EXCEPTION 'Estrutura da árvore inválida';
                END IF;
            END IF;
            RETURN NEW;
        END IF;

        -- Transições históricas (suspended, archived)
        IF NOT (
            (OLD.status = 'published' AND NEW.status = 'suspended') OR
            (OLD.status = 'published' AND NEW.status = 'archived') OR
            (OLD.status = 'suspended' AND NEW.status = 'archived')
        ) THEN
            RAISE EXCEPTION 'Transição de status de % para % não permitida', OLD.status, NEW.status;
        END IF;

        -- Imutabilidade rigorosa para registros históricos em transição
        IF (
            NEW.id IS DISTINCT FROM OLD.id OR
            NEW.procedimento_id IS DISTINCT FROM OLD.procedimento_id OR
            NEW.versao IS DISTINCT FROM OLD.versao OR
            NEW.substitui_versao_id IS DISTINCT FROM OLD.substitui_versao_id OR
            NEW.titulo IS DISTINCT FROM OLD.titulo OR
            NEW.categoria IS DISTINCT FROM OLD.categoria OR
            NEW.descricao IS DISTINCT FROM OLD.descricao OR
            NEW.setor IS DISTINCT FROM OLD.setor OR
            NEW.vigencia_inicio IS DISTINCT FROM OLD.vigencia_inicio OR
            NEW.vigencia_fim IS DISTINCT FROM OLD.vigencia_fim OR
            NEW.fonte IS DISTINCT FROM OLD.fonte OR
            NEW.arvore_decisao IS DISTINCT FROM OLD.arvore_decisao OR
            NEW.criado_por_id IS DISTINCT FROM OLD.criado_por_id OR
            NEW.publicado_por_id IS DISTINCT FROM OLD.publicado_por_id OR
            NEW.created_at IS DISTINCT FROM OLD.created_at OR
            NEW.updated_at IS DISTINCT FROM OLD.updated_at OR
            NEW.published_at IS DISTINCT FROM OLD.published_at
        ) THEN
            RAISE EXCEPTION 'Alteração de campos protegidos em versão % não permitida', OLD.status;
        END IF;
        
        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$function$;

-- 4. Refatorar RLS para impedir mutação direta para 'published'
DROP POLICY IF EXISTS "Líderes e admins atualizam status histórico" ON public.procedimento_versoes;
CREATE POLICY "Líderes e admins atualizam status histórico" ON public.procedimento_versoes 
FOR UPDATE 
TO authenticated 
USING (
    (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'leader'::app_role)) 
    AND (status = ANY (ARRAY['published'::procedimento_status, 'suspended'::procedimento_status]))
) 
WITH CHECK (
    (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'leader'::app_role)) 
    AND (status = ANY (ARRAY['suspended'::procedimento_status, 'archived'::procedimento_status]))
);
