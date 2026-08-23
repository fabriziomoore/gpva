CREATE OR REPLACE FUNCTION public.check_procedimento_versao_integrity()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- 1. Comportamento em INSERT
    IF (TG_OP = 'INSERT') THEN
        -- Validar árvore obrigatoriamente
        IF NOT public.validate_procedure_tree(NEW.arvore_decisao) THEN
            RAISE EXCEPTION 'Estrutura da árvore inválida';
        END IF;
        RETURN NEW;
    END IF;

    -- 2. Comportamento em UPDATE
    IF (TG_OP = 'UPDATE') THEN
        -- BLOQUEAR qualquer transição que não esteja na matriz permitida
        -- Matriz:
        -- draft -> draft
        -- published -> suspended
        -- published -> archived
        -- suspended -> archived
        
        IF NOT (
            (OLD.status = 'draft' AND NEW.status = 'draft') OR
            (OLD.status = 'published' AND NEW.status = 'suspended') OR
            (OLD.status = 'published' AND NEW.status = 'archived') OR
            (OLD.status = 'suspended' AND NEW.status = 'archived')
        ) THEN
            RAISE EXCEPTION 'Transição de status de % para % não permitida nesta etapa', OLD.status, NEW.status;
        END IF;

        -- DRAFT -> DRAFT
        IF OLD.status = 'draft' AND NEW.status = 'draft' THEN
            -- Se arvore_decisao mudar, validar
            IF NEW.arvore_decisao IS DISTINCT FROM OLD.arvore_decisao THEN
                IF NOT public.validate_procedure_tree(NEW.arvore_decisao) THEN
                    RAISE EXCEPTION 'Estrutura da árvore inválida';
                END IF;
            END IF;
            RETURN NEW;
        END IF;

        -- IMUTABILIDADE HISTÓRICA
        -- Transições: published -> suspended, published -> archived, suspended -> archived
        IF (OLD.status = 'published' OR OLD.status = 'suspended') THEN
            -- BLOQUEAR alteração de todos os campos exceto os 3 permitidos
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
    END IF;

    RETURN NEW;
END;
$function$;
