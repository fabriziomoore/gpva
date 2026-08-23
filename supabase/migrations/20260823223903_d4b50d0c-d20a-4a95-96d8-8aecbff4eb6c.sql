-- A1: Fundação Estrutural da Árvore Operacional (Setor -> Supervisor -> Líder -> Equipe)

-- 1. Tabela de Supervisores
CREATE TABLE public.supervisores (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nome text NOT NULL,
    setor_id uuid NOT NULL REFERENCES public.setores(id) ON DELETE RESTRICT,
    user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX supervisores_setor_id_idx ON public.supervisores(setor_id);
CREATE UNIQUE INDEX supervisores_user_id_unique_idx ON public.supervisores(user_id) WHERE user_id IS NOT NULL;

-- 2. Tabela de Estrutura de Líderes
CREATE TABLE public.lideres_estrutura (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE RESTRICT,
    nome text NOT NULL,
    setor_id uuid NOT NULL REFERENCES public.setores(id) ON DELETE RESTRICT,
    supervisor_id uuid NOT NULL REFERENCES public.supervisores(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX lideres_estrutura_setor_id_idx ON public.lideres_estrutura(setor_id);
CREATE INDEX lideres_estrutura_supervisor_id_idx ON public.lideres_estrutura(supervisor_id);

-- 3. Alteração Aditiva em Equipes
ALTER TABLE public.equipes 
ADD COLUMN supervisor_id uuid REFERENCES public.supervisores(id) ON DELETE RESTRICT,
ADD COLUMN leader_id uuid REFERENCES public.lideres_estrutura(id) ON DELETE RESTRICT;

CREATE INDEX equipes_supervisor_id_idx ON public.equipes(supervisor_id);
CREATE INDEX equipes_leader_id_idx ON public.equipes(leader_id);

-- 4. RLS (Admin-Only)
ALTER TABLE public.supervisores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lideres_estrutura ENABLE ROW LEVEL SECURITY;

-- Supervisores Policies
CREATE POLICY admin_select ON public.supervisores FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY admin_insert ON public.supervisores FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY admin_update ON public.supervisores FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY admin_delete ON public.supervisores FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Líderes Estrutura Policies
CREATE POLICY admin_select ON public.lideres_estrutura FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY admin_insert ON public.lideres_estrutura FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY admin_update ON public.lideres_estrutura FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY admin_delete ON public.lideres_estrutura FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Grants (Explicit API Access)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supervisores TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lideres_estrutura TO authenticated;
GRANT ALL ON public.supervisores TO service_role;
GRANT ALL ON public.lideres_estrutura TO service_role;

-- 5. Função para updated_at (Simples e dedicada)
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.supervisores
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.lideres_estrutura
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 6. Função de Integridade Estrutural (lideres_estrutura)
CREATE OR REPLACE FUNCTION public.check_lider_estrutura_integrity()
RETURNS TRIGGER AS $$
DECLARE
    v_supervisor_setor_id uuid;
BEGIN
    SELECT setor_id INTO v_supervisor_setor_id 
    FROM public.supervisores 
    WHERE id = NEW.supervisor_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Supervisor ID % não encontrado', NEW.supervisor_id;
    END IF;

    IF v_supervisor_setor_id IS DISTINCT FROM NEW.setor_id THEN
        RAISE EXCEPTION 'Supervisor selecionado pertence ao setor % mas o líder está no setor %', v_supervisor_setor_id, NEW.setor_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER check_integrity BEFORE INSERT OR UPDATE OF setor_id, supervisor_id ON public.lideres_estrutura
FOR EACH ROW EXECUTE FUNCTION public.check_lider_estrutura_integrity();

-- 7. Trigger de Hierarquia e Sincronização em Equipes
CREATE OR REPLACE FUNCTION public.check_equipe_hierarquia_integrity()
RETURNS TRIGGER AS $$
DECLARE
    v_supervisor_setor_id uuid;
    v_supervisor_nome text;
    v_leader_setor_id uuid;
    v_leader_supervisor_id uuid;
    v_leader_nome text;
    v_is_admin boolean;
BEGIN
    -- 7.1. Proteção: Equipe não-admin não altera hierarquia nem espelhamento textual se houver vínculo
    IF (TG_OP = 'UPDATE') THEN
        SELECT public.has_role(auth.uid(), 'admin') INTO v_is_admin;
        
        -- Se for a própria equipe e não for admin
        IF auth.uid() = OLD.id AND (NOT v_is_admin OR v_is_admin IS NULL) THEN
            -- Bloquear alteração de IDs estruturais
            IF (NEW.setor_id IS DISTINCT FROM OLD.setor_id) OR 
               (NEW.supervisor_id IS DISTINCT FROM OLD.supervisor_id) OR 
               (NEW.leader_id IS DISTINCT FROM OLD.leader_id) THEN
                RAISE EXCEPTION 'Acesso negado: equipes não podem alterar sua própria hierarquia organizacional';
            END IF;

            -- Bloquear alteração de textos se os IDs estiverem preenchidos (evitar divergência)
            IF OLD.supervisor_id IS NOT NULL AND (NEW.supervisor IS DISTINCT FROM OLD.supervisor) THEN
                 RAISE EXCEPTION 'Acesso negado: supervisor textual bloqueado para equipes vinculadas';
            END IF;
            IF OLD.leader_id IS NOT NULL AND (NEW.leader IS DISTINCT FROM OLD.leader) THEN
                 RAISE EXCEPTION 'Acesso negado: líder textual bloqueado para equipes vinculadas';
            END IF;
        END IF;
    END IF;

    -- 7.2. Validação Hierárquica (Estados Transitórios)
    
    -- Proibir líder sem supervisor
    IF NEW.leader_id IS NOT NULL AND NEW.supervisor_id IS NULL THEN
        RAISE EXCEPTION 'Configuração inválida: não é permitido definir um líder sem definir um supervisor';
    END IF;

    -- Validar Supervisor -> Setor
    IF NEW.supervisor_id IS NOT NULL THEN
        SELECT setor_id, nome INTO v_supervisor_setor_id, v_supervisor_nome 
        FROM public.supervisores WHERE id = NEW.supervisor_id;
        
        IF v_supervisor_setor_id IS DISTINCT FROM NEW.setor_id THEN
            RAISE EXCEPTION 'Supervisor pertence ao setor % mas a equipe está no setor %', v_supervisor_setor_id, NEW.setor_id;
        END IF;
        
        -- Sincronização Legada
        NEW.supervisor = v_supervisor_nome;
    END IF;

    -- Validar Líder -> Setor e Líder -> Supervisor
    IF NEW.leader_id IS NOT NULL THEN
        SELECT setor_id, supervisor_id, nome INTO v_leader_setor_id, v_leader_supervisor_id, v_leader_nome 
        FROM public.lideres_estrutura WHERE id = NEW.leader_id;

        IF v_leader_setor_id IS DISTINCT FROM NEW.setor_id THEN
            RAISE EXCEPTION 'Líder pertence ao setor % mas a equipe está no setor %', v_leader_setor_id, NEW.setor_id;
        END IF;

        IF v_leader_supervisor_id IS DISTINCT FROM NEW.supervisor_id THEN
            RAISE EXCEPTION 'Líder pertence ao supervisor % mas a equipe está sob o supervisor %', v_leader_supervisor_id, NEW.supervisor_id;
        END IF;

        -- Sincronização Legada
        NEW.leader = v_leader_nome;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER check_equipe_hierarquia BEFORE INSERT OR UPDATE OF 
    setor_id, supervisor_id, leader_id, supervisor, leader 
ON public.equipes
FOR EACH ROW EXECUTE FUNCTION public.check_equipe_hierarquia_integrity();
