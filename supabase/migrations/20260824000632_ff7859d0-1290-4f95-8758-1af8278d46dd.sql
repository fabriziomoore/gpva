
DO $$
DECLARE
    v_row_count INTEGER;
BEGIN
    -- PREFLIGHT FAIL-CLOSED
    -- 1. Setor
    IF NOT EXISTS (SELECT 1 FROM public.setores WHERE id = '16bbd6c9-0469-40b0-95c8-a2909e7312c1' AND nome = 'Corte e Religa') THEN
        RAISE EXCEPTION 'Preflight: Setor Corte e Religa não encontrado';
    END IF;

    -- 2. Supervisor
    IF NOT EXISTS (SELECT 1 FROM public.supervisores WHERE id = '8f07f6e1-45d4-4fe1-a43f-6654d6f1f638' AND nome = 'Ricardo Cunha' AND setor_id = '16bbd6c9-0469-40b0-95c8-a2909e7312c1') THEN
        RAISE EXCEPTION 'Preflight: Supervisor Ricardo Cunha não encontrado ou inconsistente';
    END IF;

    -- 3. Líder
    IF NOT EXISTS (SELECT 1 FROM public.lideres_estrutura WHERE id = '64df32a7-e4bc-4c17-9dfc-7893474678db' AND nome = 'Gabriel Araújo' AND setor_id = '16bbd6c9-0469-40b0-95c8-a2909e7312c1' AND supervisor_id = '8f07f6e1-45d4-4fe1-a43f-6654d6f1f638') THEN
        RAISE EXCEPTION 'Preflight: Líder Gabriel Araújo não encontrado ou inconsistente';
    END IF;

    -- 4. Cinco equipes alvo
    IF (SELECT count(*) FROM public.equipes WHERE id IN ('d66d1904-1514-42a6-be95-37cd32430ce8', '931f27c1-4b6a-48ec-9417-9e5d0402f133', '33995c1e-2673-4a54-b8f2-1068c956318e', 'b01b35ed-1ea9-4d41-b7dd-a05a07ae5891', '1a3bb231-d431-46d4-959d-1b8f90fa2262')) <> 5 THEN
        RAISE EXCEPTION 'Preflight: Nem todas as 5 equipes alvo foram encontradas';
    END IF;

    -- 5. Is_test=true nas alvo
    IF EXISTS (SELECT 1 FROM public.equipes WHERE id IN ('d66d1904-1514-42a6-be95-37cd32430ce8', '931f27c1-4b6a-48ec-9417-9e5d0402f133', '33995c1e-2673-4a54-b8f2-1068c956318e', 'b01b35ed-1ea9-4d41-b7dd-a05a07ae5891', '1a3bb231-d431-46d4-959d-1b8f90fa2262') AND is_test = true) THEN
        RAISE EXCEPTION 'Preflight: Uma das equipes alvo é de teste';
    END IF;

    -- 6. Setor_id diferente nas alvo
    IF EXISTS (SELECT 1 FROM public.equipes WHERE id IN ('d66d1904-1514-42a6-be95-37cd32430ce8', '931f27c1-4b6a-48ec-9417-9e5d0402f133', '33995c1e-2673-4a54-b8f2-1068c956318e', 'b01b35ed-1ea9-4d41-b7dd-a05a07ae5891', '1a3bb231-d431-46d4-959d-1b8f90fa2262') AND setor_id <> '16bbd6c9-0469-40b0-95c8-a2909e7312c1') THEN
        RAISE EXCEPTION 'Preflight: Uma das equipes alvo possui setor_id divergente';
    END IF;

    -- 7. Já possuírem vínculos
    IF EXISTS (SELECT 1 FROM public.equipes WHERE id IN ('d66d1904-1514-42a6-be95-37cd32430ce8', '931f27c1-4b6a-48ec-9417-9e5d0402f133', '33995c1e-2673-4a54-b8f2-1068c956318e', 'b01b35ed-1ea9-4d41-b7dd-a05a07ae5891', '1a3bb231-d431-46d4-959d-1b8f90fa2262') AND (supervisor_id IS NOT NULL OR leader_id IS NOT NULL)) THEN
        RAISE EXCEPTION 'Preflight: Uma das equipes alvo já possui supervisor_id ou leader_id preenchido';
    END IF;

    -- 8. Equipes externas com vínculos
    IF EXISTS (SELECT 1 FROM public.equipes WHERE id NOT IN ('d66d1904-1514-42a6-be95-37cd32430ce8', '931f27c1-4b6a-48ec-9417-9e5d0402f133', '33995c1e-2673-4a54-b8f2-1068c956318e', 'b01b35ed-1ea9-4d41-b7dd-a05a07ae5891', '1a3bb231-d431-46d4-959d-1b8f90fa2262') AND (supervisor_id IS NOT NULL OR leader_id IS NOT NULL)) THEN
         RAISE EXCEPTION 'Preflight: Existe vínculo estrutural em equipe fora do alvo da A4';
    END IF;

    -- 9. RIOTESTE-01
    IF NOT EXISTS (SELECT 1 FROM public.equipes WHERE id = '458dd5c0-94fa-4b90-b737-f15a0884f3f7' AND team_name = 'RIOTESTE-01' AND is_test = true) THEN
        RAISE EXCEPTION 'Preflight: RIOTESTE-01 não encontrada ou inconsistente';
    END IF;

    -- 10. RIOTESTE-01 com vínculos
    IF EXISTS (SELECT 1 FROM public.equipes WHERE id = '458dd5c0-94fa-4b90-b737-f15a0884f3f7' AND (supervisor_id IS NOT NULL OR leader_id IS NOT NULL)) THEN
        RAISE EXCEPTION 'Preflight: RIOTESTE-01 já possui vínculos estruturais';
    END IF;

    -- UPDATE
    UPDATE public.equipes
    SET 
        supervisor_id = '8f07f6e1-45d4-4fe1-a43f-6654d6f1f638',
        leader_id = '64df32a7-e4bc-4c17-9dfc-7893474678db'
    WHERE id IN (
        'd66d1904-1514-42a6-be95-37cd32430ce8',
        '931f27c1-4b6a-48ec-9417-9e5d0402f133',
        '33995c1e-2673-4a54-b8f2-1068c956318e',
        'b01b35ed-1ea9-4d41-b7dd-a05a07ae5891',
        '1a3bb231-d431-46d4-959d-1b8f90fa2262'
    );

    GET DIAGNOSTICS v_row_count = ROW_COUNT;

    IF v_row_count <> 5 THEN
        RAISE EXCEPTION 'Erro: ROW_COUNT = %, esperado 5', v_row_count;
    END IF;

    -- ASSERTIONS PÓS-UPDATE
    IF (SELECT count(*) FROM public.equipes WHERE supervisor_id = '8f07f6e1-45d4-4fe1-a43f-6654d6f1f638' AND leader_id = '64df32a7-e4bc-4c17-9dfc-7893474678db') <> 5 THEN
        RAISE EXCEPTION 'Post-check: Contagem de vínculos estruturais inconsistente';
    END IF;

    IF EXISTS (SELECT 1 FROM public.equipes WHERE (supervisor_id = '8f07f6e1-45d4-4fe1-a43f-6654d6f1f638' OR leader_id = '64df32a7-e4bc-4c17-9dfc-7893474678db') AND id NOT IN ('d66d1904-1514-42a6-be95-37cd32430ce8', '931f27c1-4b6a-48ec-9417-9e5d0402f133', '33995c1e-2673-4a54-b8f2-1068c956318e', 'b01b35ed-1ea9-4d41-b7dd-a05a07ae5891', '1a3bb231-d431-46d4-959d-1b8f90fa2262')) THEN
        RAISE EXCEPTION 'Post-check: Vínculo detectado em equipe não autorizada';
    END IF;

    IF EXISTS (SELECT 1 FROM public.equipes WHERE id = '458dd5c0-94fa-4b90-b737-f15a0884f3f7' AND (supervisor_id IS NOT NULL OR leader_id IS NOT NULL)) THEN
        RAISE EXCEPTION 'Post-check: RIOTESTE-01 foi alterada indevidamente';
    END IF;

    IF EXISTS (SELECT 1 FROM public.equipes WHERE id IN ('d66d1904-1514-42a6-be95-37cd32430ce8', '931f27c1-4b6a-48ec-9417-9e5d0402f133', '33995c1e-2673-4a54-b8f2-1068c956318e', 'b01b35ed-1ea9-4d41-b7dd-a05a07ae5891', '1a3bb231-d431-46d4-959d-1b8f90fa2262') AND setor_id <> '16bbd6c9-0469-40b0-95c8-a2909e7312c1') THEN
        RAISE EXCEPTION 'Post-check: setor_id foi alterado indevidamente';
    END IF;

END $$;
