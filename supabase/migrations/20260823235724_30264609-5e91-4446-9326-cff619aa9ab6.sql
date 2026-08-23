DO $$
DECLARE
    v_setor_id UUID := '16bbd6c9-0469-40b0-95c8-a2909e7312c1';
    v_supervisor_id UUID := '8f07f6e1-45d4-4fe1-a43f-6654d6f1f638';
    v_lider_id UUID := '64df32a7-e4bc-4c17-9dfc-7893474678db';
    v_lider_user_id UUID := '6a17b5a5-6716-4af4-b567-743596b1a2c7';
BEGIN
    -- 1. O setor deve existir
    IF NOT EXISTS (SELECT 1 FROM public.setores WHERE id = v_setor_id) THEN
        RAISE EXCEPTION 'Assertion failed: Setor % não encontrado.', v_setor_id;
    END IF;

    -- 2. O UUID do supervisor não deve existir
    IF EXISTS (SELECT 1 FROM public.supervisores WHERE id = v_supervisor_id) THEN
        RAISE EXCEPTION 'Assertion failed: UUID do supervisor % já existe.', v_supervisor_id;
    END IF;

    -- 3. Não deve existir supervisor com o mesmo nome (Ricardo Cunha)
    IF EXISTS (SELECT 1 FROM public.supervisores WHERE lower(trim(nome)) = lower('Ricardo Cunha')) THEN
        RAISE EXCEPTION 'Assertion failed: Supervisor com nome "Ricardo Cunha" já existe.';
    END IF;

    -- 4. O UUID do líder estrutural não deve existir
    IF EXISTS (SELECT 1 FROM public.lideres_estrutura WHERE id = v_lider_id) THEN
        RAISE EXCEPTION 'Assertion failed: UUID do líder estrutural % já existe.', v_lider_id;
    END IF;

    -- 5. Não deve existir lideres_estrutura para o user_id do líder
    IF EXISTS (SELECT 1 FROM public.lideres_estrutura WHERE user_id = v_lider_user_id) THEN
        RAISE EXCEPTION 'Assertion failed: Líder estrutural para user_id % já existe.', v_lider_user_id;
    END IF;

    -- 6. O usuário auth do líder deve existir
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_lider_user_id) THEN
        RAISE EXCEPTION 'Assertion failed: Usuário auth % não encontrado.', v_lider_user_id;
    END IF;

    -- 7. O usuário deve possuir role='leader'
    IF NOT EXISTS (
        SELECT 1 FROM public.user_roles 
        WHERE user_id = v_lider_user_id AND role = 'leader'
    ) THEN
        RAISE EXCEPTION 'Assertion failed: Usuário % não possui a role "leader".', v_lider_user_id;
    END IF;

    -- 8. Nenhuma equipe deve ter supervisor_id ou leader_id (A4 não começou)
    IF EXISTS (SELECT 1 FROM public.equipes WHERE supervisor_id IS NOT NULL OR leader_id IS NOT NULL) THEN
        RAISE EXCEPTION 'Assertion failed: Existem equipes com vínculos de estrutura (supervisor_id ou leader_id). A4 não deve ter iniciado.';
    END IF;

    -- INSERT SUPERVISOR
    INSERT INTO public.supervisores (id, nome, setor_id, user_id)
    VALUES (v_supervisor_id, 'Ricardo Cunha', v_setor_id, NULL);

    -- INSERT LÍDER
    INSERT INTO public.lideres_estrutura (id, user_id, nome, setor_id, supervisor_id)
    VALUES (v_lider_id, v_lider_user_id, 'Gabriel Araújo', v_setor_id, v_supervisor_id);

    RAISE NOTICE 'Microetapa A3 concluída com sucesso: Supervisor e Líder criados e vinculados.';
END $$;
