# Plano de Correção Cirúrgica — Publicação de Versão Sucessora (v2)

Este plano corrige a estratégia de chamada da RPC `publish_procedure_version` para alinhar com a tipagem real do Supabase e reforça a validação de sucessão no backend, impedindo auto-substituição.

## Problemas Identificados

1.  **Divergência de Sucessão:** O frontend envia `undefined` ou tenta enviar `null` (não suportado pela tipagem gerada) para `p_substitui_versao_id`. A RPC exige que o valor enviado seja idêntico ao persistido no draft.
2.  **Validação de Auto-Sucessão:** A RPC não bloqueia explicitamente o caso onde uma versão tenta substituir a si mesma.

## Mudanças Propostas

### 1. Backend (PostgreSQL)

Atualizar a RPC `public.publish_procedure_version` através de **EXATAMENTE UMA** nova migration.

```sql
-- Dentro de public.publish_procedure_version, após o lock do predecessor:
IF v_draft.substitui_versao_id IS NOT NULL THEN
    SELECT * INTO v_predecessor FROM public.procedimento_versoes 
    WHERE id = v_draft.substitui_versao_id FOR UPDATE;
    
    IF NOT FOUND THEN RAISE EXCEPTION 'Predecessor não encontrado'; END IF;
    
    -- VALIDAÇÃO ADICIONAL: Auto-sucessão
    IF v_predecessor.id IS NOT DISTINCT FROM v_draft.id THEN
        RAISE EXCEPTION 'Uma versão não pode substituir a si própria';
    END IF;
    
    -- ... restante da lógica mantido integralmente
```

### 2. Frontend (TanStack Start)

Ajustar `src/routes/_authenticated/leader-procedures.tsx` respeitando a tipagem do Supabase (`p_substitui_versao_id?: string`).

-   **PROIBIDO:** Usar `as any`, `as unknown as string`, ou enviar `null`/`undefined` explicitamente.
-   **Regra:** Omitir a propriedade se não houver predecessor.

```typescript
// Exemplo de montagem de argumentos na RPC
const publishArgs = {
  p_versao_id: id,
  p_vigencia_inicio: metadata.vigencia_inicio,
  ...(substituiVersaoId ? { p_substitui_versao_id: substituiVersaoId } : {})
};
```

## Protocolo de Aceite

1.  **V1 (Novo):** Omitir `p_substitui_versao_id`. Backend recebe `DEFAULT NULL`.
2.  **V2 (Sucessor de V1):** Enviar `V1.id` (UUID persistido no draft).
3.  **V3 (Sucessor de V2):** Enviar `V2.id` (UUID persistido no draft).
4.  **Divergência:** RPC continua bloqueando se o parâmetro divergir do draft.
5.  **Auto-sucessão:** RPC bloqueia explicitamente após lock/leitura do predecessor.
6.  **Tipagem:** Nenhuma alteração em `types.ts` ou uso de casts inseguros.
7.  **Escopo:** Apenas `leader-procedures.tsx` e a nova migration são alterados.
8.  **Congelamento:** Todos os objetos citados no escopo restrito (RLS, integridade, etc.) permanecem intactos.
9.  **Vigência:** `vigencia_inicio` mantido como `YYYY-MM-DD`.

## Objetos Congelados (NÃO ALTERAR)
- `src/integrations/supabase/types.ts`
- Migration `20260823215056`
- Triggers de integridade e overlap
- RLS e roles (`internal_proc_executor`)
- Funcionalidades mobile/offline e SideMenu
