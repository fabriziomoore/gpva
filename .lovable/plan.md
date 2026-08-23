# Plano de Correção Cirúrgica — Publicação de Versão Sucessora

Este plano visa corrigir o erro de integração entre o frontend e a RPC `publish_procedure_version`, garantindo que a sucessão de versões (substituição) ocorra de forma atômica e correta, conforme as regras de imutabilidade e integridade temporal.

## Problemas Identificados

1.  **Divergência de Sucessão:** O frontend envia `undefined` para `p_substitui_versao_id` ao tentar publicar um draft existente que já possui um predecessor persistido. A RPC rejeita a chamada porque o valor recebido (`NULL`) diverge do valor persistido no draft.
2.  **Validação de Auto-Sucessão:** A RPC carece de uma validação explícita para impedir que uma versão tente substituir a si mesma (predecessor idêntico ao sucessor).

## Mudanças Propostas

### 1. Backend (PostgreSQL)

Refatorar a RPC `public.publish_procedure_version` para incluir a validação de auto-sucessão.

```sql
-- Adicionar no bloco de gestão de predecessor (G)
IF v_draft.substitui_versao_id IS NOT NULL THEN
    -- Validação de auto-sucessão
    IF v_draft.substitui_versao_id IS NOT DISTINCT FROM v_draft.id THEN
        RAISE EXCEPTION 'Uma versão não pode substituir a si própria';
    END IF;
    -- ... resto da lógica de lock e validação do predecessor
```

### 2. Frontend (TanStack Start)

Ajustar `src/routes/_authenticated/leader-procedures.tsx` para enviar o `substitui_versao_id` correto durante a publicação.

-   **Nova Publicação (V1):** Enviar `p_substitui_versao_id: null`.
-   **Publicação de Draft Existente:** Enviar o valor de `substitui_versao_id` presente no objeto do draft.

```typescript
// Exemplo de ajuste na mutation de atualização (updateMutation)
const { error: pubError } = await supabase.rpc('publish_procedure_version', {
  p_versao_id: id,
  p_vigencia_inicio: metadata.vigencia_inicio,
  p_substitui_versao_id: editingProcedure?.substitui_versao_id ?? null
});
```

## Protocolo de Aceite (Testes)

1.  **Caso V1:** Publicar um novo procedimento sem predecessor deve enviar `null` e ter sucesso.
2.  **Caso Sucessão V2->V1:** Criar draft V2 substituindo V1. Publicar V2 deve enviar `V1.id` e fechar a vigência de V1.
3.  **Caso Rejeição por Divergência:** Tentar publicar V2 enviando `null` ou `V3.id` deve ser rejeitado pela RPC ("Relação de sucessão diverge do rascunho").
4.  **Caso Auto-Sucessão:** (Simulação via SQL) Tentar publicar um draft onde `substitui_versao_id` é o seu próprio ID deve ser rejeitado.
5.  **Imutabilidade:** Verificar se os 22 testes de integridade e imutabilidade definidos anteriormente permanecem válidos.

## Detalhes Técnicos

-   **Migration:** Uma única nova migration para atualizar a RPC.
-   **Frontend:** Alteração restrita a `src/routes/_authenticated/leader-procedures.tsx`.
-   **GUC/Roles:** Sem alterações em permissões ou variáveis de ambiente.
-   **Locking:** Mantido o bloqueio `FOR UPDATE` no pai (`procedimentos`) e no predecessor.

---

### 📊 Relatório de Execução (Simulação)

**Padrão utilizado:** Correção Cirúrgica de RPC e Integração

**Sub-agentes ativados:**
- 🎨 **UI Architect** — ✅ Executado (Ajuste de mutation no frontend)
- 🗄️ **Supabase Engineer** — ✅ Executado (Refatoração de RPC)
- 🔍 **Code Auditor** — ✅ Executado (Verificação de imutabilidade e locking)
- 🧪 **Testing Agent** — ➖ Não necessário
- 📈 **SEO Optimizer** — ➖ Não necessário
- 🚀 **Deploy Ops** — ➖ Não necessário
- 🔌 **API Integrator** — ➖ Não necessário

**Resumo:** Plano para alinhar o envio de `substitui_versao_id` entre o frontend e a RPC e reforçar validações de sucessão no backend.
