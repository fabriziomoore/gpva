# Plano: Reset Isolado da Conta Demo (Apresentação)

Este plano estabelece a implementação de um mecanismo de "autolimpeza" para a conta de demonstração do GPVA. Todo dado gerado durante uma sessão demo será apagado ao realizar logout, garantindo que cada nova apresentação comece com um estado limpo, sem afetar dados produtivos.

## 🎯 Objetivos
- Implementar limpeza atômica no servidor via RPC segura.
- Implementar limpeza local (Dexie + Outbox) para suportar uso offline.
- Integrar o reset ao fluxo de logout sem alterar o comportamento de contas produtivas.
- Garantir isolamento total: nunca atingir equipes onde `is_test = false`.

## 🛠️ Detalhes Técnicos

### 1. Camada de Banco de Dados (Supabase)
Será criada uma RPC `public.reset_current_demo_session()` via migration.

- **Segurança:** `SECURITY DEFINER` com `search_path = public, pg_temp`.
- **Validação:** Obtém o ID via `auth.uid()`. Valida se `equipes.is_test = true` antes de qualquer ação.
- **Atomicidade:** Toda a operação ocorrerá dentro de uma única transação.
- **Ordem de Exclusão (FK safe):**
  1. `impactos_expediente`
  2. `vinculos_complementos`
  3. `servicos`
  4. `expedientes`
  5. `catalog_order`
  6. Catálogos específicos: `tipos_servico`, `motivos_inviabilidade`, `impactos`, `complementos_servico` onde `team_id = auth.uid()`.
- **Restrição:** `REVOKE ALL ON FUNCTION` e `GRANT EXECUTE` apenas para `authenticated`.

### 2. Camada Frontend (Offline & Sync)
Novo módulo `src/lib/demo-reset.ts` para lidar com o estado local.

- **Limpeza Dexie:** Remove registros de `shifts`, `services`, `complement_links` e `shift_impacts` filtrando por `team_id`.
- **Gestão de Outbox:** Remove operações pendentes no `outbox` que pertençam à equipe demo, impedindo que dados de uma sessão de teste sejam sincronizados após o logout.
- **Detecção Offline:** A detecção de conta demo usará o estado da equipe persistido no banco local.

### 3. Integração com Auth
Modificação em `src/lib/auth.ts` (função `signOutApp`):
- Antes de invalidar a sessão, verifica se a equipe atual é demo.
- Se for demo:
  1. Tenta chamar `reset_current_demo_session()` (online).
  2. Executa `performDemoReset` (local/offline).
- Continua com o logout padrão.

## 📋 Plano de Testes
- **Teste 1 (Produção):** Validar que o logout de uma conta real não remove nenhum dado e não tenta chamar a RPC de reset.
- **Teste 2 (Demo Online):** Criar dados, deslogar e confirmar que o servidor e o local estão limpos.
- **Teste 3 (Demo Offline):** Criar dados sem internet, deslogar e confirmar que o outbox foi limpo e os dados não "ressurgem" ao reconectar.
- **Teste 4 (Segurança):** Tentar chamar a RPC manualmente com um token de usuário produtivo e confirmar falha silenciosa ou bloqueio (não apaga nada).

## ⚠️ Garantias de Segurança
- A RPC não aceita parâmetros de `team_id` (usa `auth.uid()`).
- O filtro `is_test = true` é aplicado com lock (`FOR UPDATE`) na tabela `equipes`.
- Catálogos globais (`team_id IS NULL`) são explicitamente preservados.
- Nenhuma alteração em tabelas estruturais (`setores`, `lideres`, etc.).

---
**Microetapa A3 e A4 da Árvore Operacional permanecem suspensas.**
