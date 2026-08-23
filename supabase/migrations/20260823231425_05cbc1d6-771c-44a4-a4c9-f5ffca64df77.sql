-- Migration: Reset Current Demo Session
-- Descrição: RPC para apagar dados operacionais de contas marcadas como demo (is_test = true)

CREATE OR REPLACE FUNCTION public.reset_current_demo_session()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_team_id uuid;
    v_is_test boolean;
    v_count_expedientes int := 0;
    v_count_servicos int := 0;
    v_count_vinculos int := 0;
    v_count_impactos int := 0;
    v_count_catord int := 0;
    v_count_complementos int := 0;
    v_count_impactos_cat int := 0;
    v_count_motivos int := 0;
    v_count_tipos int := 0;
BEGIN
    v_team_id := auth.uid();
    IF v_team_id IS NULL THEN
        RAISE EXCEPTION 'Não autenticado';
    END IF;

    -- Lock na equipe para validar is_test e garantir atomicidade
    SELECT is_test INTO v_is_test
    FROM public.equipes
    WHERE id = v_team_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Equipe não encontrada';
    END IF;

    -- Se não for demo, retorna status not_demo sem apagar nada (idempotência)
    IF v_is_test IS DISTINCT FROM true THEN
        RETURN jsonb_build_object('status', 'not_demo');
    END IF;

    -- DELETEs em ordem de dependência (Bottom-up)
    
    -- 1. Vínculos de complementos
    DELETE FROM public.vinculos_complementos WHERE team_id = v_team_id;
    GET DIAGNOSTICS v_count_vinculos = ROW_COUNT;

    -- 2. Impactos do expediente
    DELETE FROM public.impactos_expediente WHERE team_id = v_team_id;
    GET DIAGNOSTICS v_count_impactos = ROW_COUNT;

    -- 3. Serviços
    DELETE FROM public.servicos WHERE team_id = v_team_id;
    GET DIAGNOSTICS v_count_servicos = ROW_COUNT;

    -- 4. Expedientes
    DELETE FROM public.expedientes WHERE team_id = v_team_id;
    GET DIAGNOSTICS v_count_expedientes = ROW_COUNT;

    -- 5. Ordenação de catálogos
    DELETE FROM public.catalog_order WHERE team_id = v_team_id;
    GET DIAGNOSTICS v_count_catord = ROW_COUNT;

    -- 6. Catálogos específicos da demo (customizações de tipos, motivos, etc)
    DELETE FROM public.complementos_servico WHERE team_id = v_team_id;
    GET DIAGNOSTICS v_count_complementos = ROW_COUNT;

    DELETE FROM public.impactos WHERE team_id = v_team_id;
    GET DIAGNOSTICS v_count_impactos_cat = ROW_COUNT;

    DELETE FROM public.motivos_inviabilidade WHERE team_id = v_team_id;
    GET DIAGNOSTICS v_count_motivos = ROW_COUNT;

    DELETE FROM public.tipos_servico WHERE team_id = v_team_id;
    GET DIAGNOSTICS v_count_tipos = ROW_COUNT;

    RETURN jsonb_build_object(
        'status', 'reset',
        'expedientes', v_count_expedientes,
        'servicos', v_count_servicos,
        'vinculos_complementos', v_count_vinculos,
        'impactos_expediente', v_count_impactos,
        'catalog_order', v_count_catord,
        'complementos_servico', v_count_complementos,
        'impactos', v_count_impactos_cat,
        'motivos_inviabilidade', v_count_motivos,
        'tipos_servico', v_count_tipos
    );
END;
$$;

-- Segurança: Revogar acesso público e conceder apenas a autenticados
REVOKE ALL ON FUNCTION public.reset_current_demo_session() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reset_current_demo_session() FROM anon;
GRANT EXECUTE ON FUNCTION public.reset_current_demo_session() TO authenticated;
