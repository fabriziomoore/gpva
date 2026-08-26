DO $$
DECLARE
  v_row_count integer;
  v_ok integer;
BEGIN
  -- PREFLIGHT 1..4: três equipes, is_test=false, IDs estruturais, supervisor='Ricardo Cunha', leader='Gabriel Araújo'
  SELECT count(*) INTO v_ok
  FROM public.equipes
  WHERE id IN (
      'd66d1904-1514-42a6-be95-37cd32430ce8',
      '33995c1e-2673-4a54-b8f2-1068c956318e',
      '1a3bb231-d431-46d4-959d-1b8f90fa2262')
    AND is_test = false
    AND setor_id = '16bbd6c9-0469-40b0-95c8-a2909e7312c1'
    AND supervisor_id = '8f07f6e1-45d4-4fe1-a43f-6654d6f1f638'
    AND leader_id = '64df32a7-e4bc-4c17-9dfc-7893474678db'
    AND supervisor = 'Ricardo Cunha'
    AND length(supervisor) = 13
    AND leader = 'Gabriel Araújo';
  IF v_ok <> 3 THEN
    RAISE EXCEPTION 'PREFLIGHT FALHOU: esperadas 3 equipes elegíveis, encontradas %', v_ok;
  END IF;

  -- PREFLIGHT 6: RIOTESTE-01 intacta
  SELECT count(*) INTO v_ok
  FROM public.equipes
  WHERE id = '458dd5c0-94fa-4b90-b737-f15a0884f3f7'
    AND is_test = true
    AND supervisor_id IS NULL
    AND leader_id IS NULL;
  IF v_ok <> 1 THEN
    RAISE EXCEPTION 'PREFLIGHT FALHOU: RIOTESTE-01 fora do estado esperado';
  END IF;

  -- UPDATE cirúrgico
  UPDATE public.equipes
  SET supervisor = CASE id
      WHEN 'd66d1904-1514-42a6-be95-37cd32430ce8' THEN ''
      WHEN '33995c1e-2673-4a54-b8f2-1068c956318e' THEN 'Ricardo Cunha '
      WHEN '1a3bb231-d431-46d4-959d-1b8f90fa2262' THEN ''
      ELSE supervisor
    END
  WHERE id IN (
    'd66d1904-1514-42a6-be95-37cd32430ce8',
    '33995c1e-2673-4a54-b8f2-1068c956318e',
    '1a3bb231-d431-46d4-959d-1b8f90fa2262');

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  IF v_row_count <> 3 THEN
    RAISE EXCEPTION 'ROW_COUNT inesperado: %', v_row_count;
  END IF;

  -- ASSERTIONS PÓS-UPDATE
  SELECT count(*) INTO v_ok FROM public.equipes
  WHERE (id = 'd66d1904-1514-42a6-be95-37cd32430ce8' AND supervisor = '' AND length(supervisor) = 0)
     OR (id = '33995c1e-2673-4a54-b8f2-1068c956318e' AND supervisor = 'Ricardo Cunha ' AND length(supervisor) = 14)
     OR (id = '1a3bb231-d431-46d4-959d-1b8f90fa2262' AND supervisor = '' AND length(supervisor) = 0);
  IF v_ok <> 3 THEN
    RAISE EXCEPTION 'PÓS-CHECK FALHOU: strings restauradas incorretas (%)', v_ok;
  END IF;

  SELECT count(*) INTO v_ok FROM public.equipes
  WHERE id IN ('931f27c1-4b6a-48ec-9417-9e5d0402f133','b01b35ed-1ea9-4d41-b7dd-a05a07ae5891')
    AND supervisor = 'Ricardo Cunha';
  IF v_ok <> 2 THEN
    RAISE EXCEPTION 'PÓS-CHECK FALHOU: RIOCERLT-013/017 alteradas';
  END IF;

  SELECT count(*) INTO v_ok FROM public.equipes
  WHERE id IN (
      'd66d1904-1514-42a6-be95-37cd32430ce8','931f27c1-4b6a-48ec-9417-9e5d0402f133',
      '33995c1e-2673-4a54-b8f2-1068c956318e','b01b35ed-1ea9-4d41-b7dd-a05a07ae5891',
      '1a3bb231-d431-46d4-959d-1b8f90fa2262')
    AND leader = 'Gabriel Araújo'
    AND supervisor_id = '8f07f6e1-45d4-4fe1-a43f-6654d6f1f638'
    AND leader_id = '64df32a7-e4bc-4c17-9dfc-7893474678db'
    AND setor_id = '16bbd6c9-0469-40b0-95c8-a2909e7312c1';
  IF v_ok <> 5 THEN
    RAISE EXCEPTION 'PÓS-CHECK FALHOU: vínculos estruturais alterados (%)', v_ok;
  END IF;

  SELECT count(*) INTO v_ok FROM public.equipes
  WHERE id = '458dd5c0-94fa-4b90-b737-f15a0884f3f7'
    AND is_test = true AND supervisor_id IS NULL AND leader_id IS NULL
    AND supervisor = 'José Antônio ' AND leader = 'Wanderley da Cunha';
  IF v_ok <> 1 THEN
    RAISE EXCEPTION 'PÓS-CHECK FALHOU: RIOTESTE-01 alterada';
  END IF;
END
$$;