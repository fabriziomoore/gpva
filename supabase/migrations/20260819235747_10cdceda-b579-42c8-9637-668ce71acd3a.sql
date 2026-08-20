-- Migration Corretiva Final Fase 1A
-- Reforço de integridade, imutabilidade e versionamento atômico

-- 1. Alterar FK para ON DELETE RESTRICT
ALTER TABLE public.procedimento_versoes 
DROP CONSTRAINT IF EXISTS procedimento_versoes_procedimento_id_fkey,
ADD CONSTRAINT procedimento_versoes_procedimento_id_fkey 
    FOREIGN KEY (procedimento_id) 
    REFERENCES public.procedimentos(id) 
    ON DELETE RESTRICT;

-- 2. Constraints de integridade para substitui_versao_id
ALTER TABLE public.procedimento_versoes
ADD CONSTRAINT check_not_self_referencing 
    CHECK (substitui_versao_id IS NULL OR substitui_versao_id != id);

-- 3. Função para validar que a substituição pertence ao mesmo procedimento
CREATE OR REPLACE FUNCTION public.validate_versao_substituicao()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.substitui_versao_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.procedimento_versoes
            WHERE id = NEW.substitui_versao_id 
              AND procedimento_id = NEW.procedimento_id
        ) THEN
            RAISE EXCEPTION 'A versão substituída deve pertencer ao mesmo procedimento lógico.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_validate_versao_substituicao
BEFORE INSERT OR UPDATE ON public.procedimento_versoes
FOR EACH ROW EXECUTE FUNCTION public.validate_versao_substituicao();

-- 4. Impedir sobreposição de vigência para versões publicadas
CREATE OR REPLACE FUNCTION public.check_vigencia_overlap()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'published' THEN
        IF EXISTS (
            SELECT 1 FROM public.procedimento_versoes
            WHERE procedimento_id = NEW.procedimento_id
              AND status = 'published'
              AND id != NEW.id
              AND (
                (NEW.vigencia_inicio, COALESCE(NEW.vigencia_fim, '9999-12-31')) OVERLAPS 
                (vigencia_inicio, COALESCE(vigencia_fim, '9999-12-31'))
              )
        ) THEN
            RAISE EXCEPTION 'Já existe uma versão publicada para este procedimento com vigência sobreposta.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_check_vigencia_overlap
BEFORE INSERT OR UPDATE ON public.procedimento_versoes
FOR EACH ROW EXECUTE FUNCTION public.check_vigencia_overlap();

-- 5. Reforçar imutabilidade pós-draft
CREATE OR REPLACE FUNCTION public.enforce_versao_immutability()
RETURNS TRIGGER AS $$
BEGIN
    -- Se o status antigo não era draft, bloquear alterações em campos operacionais
    IF OLD.status != 'draft' THEN
        -- Permitir apenas alteração de status e campos de auditoria
        IF (NEW.titulo != OLD.titulo OR
            NEW.categoria != OLD.categoria OR
            NEW.descricao IS DISTINCT FROM OLD.descricao OR
            NEW.setor IS DISTINCT FROM OLD.setor OR
            NEW.fonte IS DISTINCT FROM OLD.fonte OR
            NEW.arvore_decisao IS DISTINCT FROM OLD.arvore_decisao OR
            NEW.vigencia_inicio != OLD.vigencia_inicio OR
            NEW.vigencia_fim IS DISTINCT FROM OLD.vigencia_fim OR
            NEW.procedimento_id != OLD.procedimento_id OR
            NEW.versao != OLD.versao OR
            NEW.substitui_versao_id IS DISTINCT FROM OLD.substitui_versao_id OR
            NEW.criado_por_id != OLD.criado_por_id) THEN
            RAISE EXCEPTION 'Versões fora de rascunho (draft) são imutáveis. Crie uma nova versão para fazer alterações.';
        END IF;
        
        -- Transições de status proibidas
        IF OLD.status = 'suspended' AND NEW.status = 'published' THEN
            RAISE EXCEPTION 'Não é permitido re-publicar uma versão suspensa diretamente.';
        END IF;
        IF OLD.status = 'archived' AND NEW.status != 'archived' THEN
            RAISE EXCEPTION 'Arquivado é um estado terminal.';
        END IF;
        IF NEW.status = 'draft' THEN
            RAISE EXCEPTION 'Não é permitido retornar uma versão publicada para rascunho.';
        END IF;
    END IF;
    
    -- Bloquear exclusão física via trigger separado ou aqui
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_enforce_versao_immutability
BEFORE UPDATE ON public.procedimento_versoes
FOR EACH ROW EXECUTE FUNCTION public.enforce_versao_immutability();

-- 6. Bloquear DELETE físico
CREATE OR REPLACE FUNCTION public.prevent_versao_deletion()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status != 'draft' THEN
        RAISE EXCEPTION 'Somente rascunhos podem ser excluídos fisicamente.';
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_prevent_versao_deletion
BEFORE DELETE ON public.procedimento_versoes
FOR EACH ROW EXECUTE FUNCTION public.prevent_versao_deletion();

-- 7. RPC Atômico para criação
CREATE OR REPLACE FUNCTION public.create_procedure_with_version(
    p_titulo TEXT,
    p_categoria TEXT,
    p_descricao TEXT,
    p_setor TEXT,
    p_fonte TEXT,
    p_vigencia_inicio DATE,
    p_vigencia_fim DATE,
    p_arvore_decisao JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_proc_id UUID;
    v_versao_id UUID;
    v_user_id UUID;
BEGIN
    v_user_id := auth.uid();
    
    -- Validar role (sistema atual GPVA)
    IF NOT (public.has_role(v_user_id, 'leader') OR public.has_role(v_user_id, 'admin')) THEN
        RAISE EXCEPTION 'Acesso negado. Apenas líderes ou administradores podem criar procedimentos.';
    END IF;

    -- 1. Criar identidade lógica
    INSERT INTO public.procedimentos (
        nome_logico,
        responsavel_id
    ) VALUES (
        lower(regexp_replace(p_titulo, '\s+', '_', 'g')),
        v_user_id
    ) RETURNING id INTO v_proc_id;

    -- 2. Criar primeira versão draft
    INSERT INTO public.procedimento_versoes (
        procedimento_id,
        titulo,
        categoria,
        descricao,
        setor,
        fonte,
        versao,
        status,
        arvore_decisao,
        vigencia_inicio,
        vigencia_fim,
        criado_por_id
    ) VALUES (
        v_proc_id,
        p_titulo,
        p_categoria,
        p_descricao,
        p_setor,
        p_fonte,
        1,
        'draft',
        p_arvore_decisao,
        p_vigencia_inicio,
        p_vigencia_fim,
        v_user_id
    ) RETURNING id INTO v_versao_id;

    RETURN v_proc_id;
END;
$$;

-- Grant execution to authenticated users
GRANT EXECUTE ON FUNCTION public.create_procedure_with_version TO authenticated;
