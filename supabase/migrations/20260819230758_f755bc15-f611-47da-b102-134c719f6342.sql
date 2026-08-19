-- Criação do enum de status (se não existir)
DO $$ BEGIN
    CREATE TYPE public.procedimento_status AS ENUM ('draft', 'published', 'suspended', 'archived');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Tabela de procedimentos (Identidade Lógica)
CREATE TABLE IF NOT EXISTS public.procedimentos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome_logico TEXT NOT NULL,
    responsavel_id UUID REFERENCES auth.users(id) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela de versões de procedimentos (Conteúdo Versionado)
CREATE TABLE IF NOT EXISTS public.procedimento_versoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    procedimento_id UUID REFERENCES public.procedimentos(id) ON DELETE CASCADE NOT NULL,
    versao INTEGER NOT NULL,
    substitui_versao_id UUID REFERENCES public.procedimento_versoes(id),
    titulo TEXT NOT NULL,
    categoria TEXT NOT NULL,
    descricao TEXT,
    setor TEXT,
    status public.procedimento_status NOT NULL DEFAULT 'draft',
    vigencia_inicio TIMESTAMPTZ NOT NULL,
    vigencia_fim TIMESTAMPTZ,
    fonte TEXT,
    arvore_decisao JSONB NOT NULL,
    criado_por_id UUID REFERENCES auth.users(id) NOT NULL,
    publicado_por_id UUID REFERENCES auth.users(id),
    status_alterado_por_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    published_at TIMESTAMPTZ,
    status_updated_at TIMESTAMPTZ,
    UNIQUE(procedimento_id, versao)
);

-- Habilitar RLS
ALTER TABLE public.procedimentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procedimento_versoes ENABLE ROW LEVEL SECURITY;

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.procedimentos TO authenticated;
GRANT ALL ON public.procedimentos TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.procedimento_versoes TO authenticated;
GRANT ALL ON public.procedimento_versoes TO service_role;

-- Políticas para procedimentos
CREATE POLICY "Líderes e Admins podem gerenciar procedimentos"
ON public.procedimentos
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'leader'));

CREATE POLICY "Todos podem ler procedimentos"
ON public.procedimentos
FOR SELECT
TO authenticated
USING (true);

-- Políticas para procedimento_versoes
CREATE POLICY "Equipe lê apenas publicados e vigentes"
ON public.procedimento_versoes
FOR SELECT
TO authenticated
USING (
    status = 'published' 
    AND vigencia_inicio <= now() 
    AND (vigencia_fim IS NULL OR vigencia_fim > now())
);

CREATE POLICY "Líderes e Admins podem ler todos"
ON public.procedimento_versoes
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'leader'));

CREATE POLICY "Líderes podem inserir rascunhos"
ON public.procedimento_versoes
FOR INSERT
TO authenticated
WITH CHECK (
    (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'leader'))
    AND status = 'draft'
);

CREATE POLICY "Líderes podem editar rascunhos"
ON public.procedimento_versoes
FOR UPDATE
TO authenticated
USING (
    (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'leader'))
    AND status = 'draft'
)
WITH CHECK (status IN ('draft', 'published'));

CREATE POLICY "Líderes podem alterar status de publicados"
ON public.procedimento_versoes
FOR UPDATE
TO authenticated
USING (
    (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'leader'))
    AND status != 'draft'
)
WITH CHECK (
    status IN ('suspended', 'archived')
);

-- Função e Trigger de Imutabilidade
CREATE OR REPLACE FUNCTION public.check_procedimento_versao_immutability()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status != 'draft' THEN
        IF (NEW.procedimento_id IS DISTINCT FROM OLD.procedimento_id OR
            NEW.versao IS DISTINCT FROM OLD.versao OR
            NEW.titulo IS DISTINCT FROM OLD.titulo OR
            NEW.categoria IS DISTINCT FROM OLD.categoria OR
            NEW.descricao IS DISTINCT FROM OLD.descricao OR
            NEW.setor IS DISTINCT FROM OLD.setor OR
            NEW.vigencia_inicio IS DISTINCT FROM OLD.vigencia_inicio OR
            NEW.fonte IS DISTINCT FROM OLD.fonte OR
            NEW.arvore_decisao IS DISTINCT FROM OLD.arvore_decisao OR
            NEW.criado_por_id IS DISTINCT FROM OLD.criado_por_id OR
            NEW.publicado_por_id IS DISTINCT FROM OLD.publicado_por_id OR
            NEW.created_at IS DISTINCT FROM OLD.created_at) THEN
            RAISE EXCEPTION 'Conteúdo operacional de versão publicada é imutável.';
        END IF;
        
        IF OLD.status = 'archived' AND NEW.status != 'archived' THEN
            RAISE EXCEPTION 'Versões arquivadas não podem ser alteradas.';
        END IF;
    END IF;

    IF OLD.status = 'draft' AND NEW.status = 'published' THEN
        NEW.published_at = now();
        NEW.publicado_por_id = auth.uid();
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
        NEW.status_updated_at = now();
        NEW.status_alterado_por_id = auth.uid();
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_procedimento_versao_immutability
BEFORE UPDATE ON public.procedimento_versoes
FOR EACH ROW
EXECUTE FUNCTION public.check_procedimento_versao_immutability();

-- Bloqueio de DELETE físico em publicados
CREATE OR REPLACE FUNCTION public.prevent_procedimento_versao_delete()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status != 'draft' THEN
        RAISE EXCEPTION 'Não é permitido excluir versões publicadas, suspensas ou arquivadas. Use o status "archived".';
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_procedimento_versao_delete
BEFORE DELETE ON public.procedimento_versoes
FOR EACH ROW
EXECUTE FUNCTION public.prevent_procedimento_versao_delete();
