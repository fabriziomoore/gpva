CREATE OR REPLACE FUNCTION public.check_equipe_hierarquia_integrity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_supervisor_setor_id uuid;
    v_leader_setor_id uuid;
    v_leader_supervisor_id uuid;
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
        SELECT setor_id INTO v_supervisor_setor_id
        FROM public.supervisores WHERE id = NEW.supervisor_id;

        IF v_supervisor_setor_id IS DISTINCT FROM NEW.setor_id THEN
            RAISE EXCEPTION 'Supervisor pertence ao setor % mas a equipe está no setor %', v_supervisor_setor_id, NEW.setor_id;
        END IF;
    END IF;

    -- Validar Líder -> Setor e Líder -> Supervisor
    IF NEW.leader_id IS NOT NULL THEN
        SELECT setor_id, supervisor_id INTO v_leader_setor_id, v_leader_supervisor_id
        FROM public.lideres_estrutura WHERE id = NEW.leader_id;

        IF v_leader_setor_id IS DISTINCT FROM NEW.setor_id THEN
            RAISE EXCEPTION 'Líder pertence ao setor % mas a equipe está no setor %', v_leader_setor_id, NEW.setor_id;
        END IF;

        IF v_leader_supervisor_id IS DISTINCT FROM NEW.supervisor_id THEN
            RAISE EXCEPTION 'Líder pertence ao supervisor % mas a equipe está sob o supervisor %', v_leader_supervisor_id, NEW.supervisor_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$function$
;