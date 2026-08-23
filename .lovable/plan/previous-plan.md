# Plano: Reset Isolado da Conta Demo (Revisão Final)

Este plano detalha a implementação técnica da autolimpeza para contas de demonstração (`is_test = true`), garantindo que dados transitórios sejam removidos ao logout, tanto no servidor quanto localmente.

## 1. Banco de Dados (Supabase Migration)
Criar a RPC `public.reset_current_demo_session()` com as seguintes especificações:

```sql
CREATE OR REPLACE FUNCTION public.reset_current_demo_session()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_team_id uuid;
    v_is_test boolean;
    v_results jsonb;
    v_count_expedientes int;
    v_count_servicos int;
    v_count_vinculos int;
    v_count_impactos int;
    v_count_catord int;
    v_count_complementos int;
    v_count_impactos_cat int;
    v_count_motivos int;
    v_count_tipos int;
BEGIN
    v_team_id := auth.uid();
    IF v_team_id IS NULL THEN
        RAISE EXCEPTION 'Não autenticado';
    END IF;

    -- Lock na equipe para validar is_test
    SELECT is_test INTO v_is_test
    FROM public.equipes
    WHERE id = v_team_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Equipe não encontrada';
    END IF;

    IF v_is_test IS DISTINCT FROM true THEN
        RETURN jsonb_build_object('status', 'not_demo');
    END IF;

    -- DELETEs em ordem de FK (Bottom-up)
    DELETE FROM public.vinculos_complementos WHERE team_id = v_team_id;
    GET DIAGNOSTICS v_count_vinculos = ROW_COUNT;

    DELETE FROM public.impactos_expediente WHERE team_id = v_team_id;
    GET DIAGNOSTICS v_count_impactos = ROW_COUNT;

    DELETE FROM public.servicos WHERE team_id = v_team_id;
    GET DIAGNOSTICS v_count_servicos = ROW_COUNT;

    DELETE FROM public.expedientes WHERE team_id = v_team_id;
    GET DIAGNOSTICS v_count_expedientes = ROW_COUNT;

    DELETE FROM public.catalog_order WHERE team_id = v_team_id;
    GET DIAGNOSTICS v_count_catord = ROW_COUNT;

    -- Catálogos específicos da demo
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

-- Permissões
REVOKE ALL ON FUNCTION public.reset_current_demo_session() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reset_current_demo_session() FROM anon;
GRANT EXECUTE ON FUNCTION public.reset_current_demo_session() TO authenticated;
```

## 2. Implementação Frontend

### Módulo `src/lib/demo-reset.ts`
- **KV Storage:** Usar chaves `demo:account:<userId>` para persistir `{ is_test: boolean, verified_at: string }`.
- **Limpeza Local (Dexie):** Transação `rw` para limpar registros operacionais da demo.
- **Limpeza Outbox:** Algoritmo exato para remover apenas itens do `team_id` demo ou vinculados a registros demo, preservando a entrada da própria `equipes`.
- **Remote Reset Pending:** Marcador no KV `demo:remote-reset-pending:<userId>` para retentar a limpeza remota caso a RPC falhe.

### Módulo `src/lib/auth.ts`
- **Login Online:** Consultar `public.equipes.is_test` e gravar no KV via helper.
- **`performAppSignOut`:** Nova função que coordena:
  1. Chamada à RPC (se online).
  2. Limpeza local via `demo-reset.ts`.
  3. Gestão do marcador `remote-reset-pending`.
  4. Fluxo normal de `signOutApp`.

### Componente `src/components/layout/SideMenu.tsx`
- Alteração cirúrgica no `confirmSignOut` para aguardar `performAppSignOut` enquanto a sessão ainda é válida, mantendo a desmontagem segura da tela.

## 3. Estratégia de Testes
- **Produção:** Baseline de contagem em `RIOCERLT-017` (15 exp / 205 serv). Confirmar zero alteração após logout.
- **Demo:** Criar massa de dados (online e offline), deslogar e verificar limpeza total.
- **Falha:** Simular falha na rede durante o logout demo e confirmar que o reset remoto é executado no próximo login online.

## 4. Arquivos Impactados
- `supabase/migrations/<timestamp>_reset_current_demo_session.sql`
- `src/lib/demo-reset.ts` (Novo)
- `src/lib/auth.ts`
- `src/components/layout/SideMenu.tsx`

---
**Microetapa A3 e A4 da Árvore Operacional permanecem suspensas.**
