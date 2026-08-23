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

        -- VALIDAÇÃO ADICIONAL: Auto-sucessão (Audit Pós-Fase 1A)
        IF v_predecessor.id IS NOT DISTINCT FROM v_draft.id THEN
            RAISE EXCEPTION 'Uma versão não pode substituir a si própria';
        END IF;
        
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
