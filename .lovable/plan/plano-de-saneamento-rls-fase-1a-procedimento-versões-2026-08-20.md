# Plano de Saneamento RLS — Fase 1A (Procedimento Versões)

## 1. Objetivo Único
Corrigir exclusivamente as políticas de Row Level Security (RLS) da tabela `public.procedimento_versoes`. Não serão alteradas funções, triggers, roles, ou qualquer outra tabela do sistema.

## 2. Implementação
A migration executará as seguintes etapas em uma única transação:
1.  Remover todas as políticas existentes na tabela `public.procedimento_versoes`.
2.  Criar exatamente as 6 políticas canônicas solicitadas:
    -   **Equipes veem publicados ativos**: Permite SELECT para `authenticated` onde status é 'published' e a vigência é atual.
    -   **Líderes e admins veem tudo**: Permite SELECT de todas as linhas para usuários com roles 'leader' ou 'admin'.
    -   **Líderes e admins inserem drafts**: Permite INSERT de novas linhas com status 'draft' para 'leader' ou 'admin'.
    -   **Líderes e admins editam drafts**: Permite UPDATE de linhas com status 'draft' para 'leader' ou 'admin'.
    -   **Líderes e admins atualizam status histórico**: Permite UPDATE do status (arquivamento/suspensão) para 'leader' ou 'admin'.
    -   **Líderes e admins deletam drafts**: Permite DELETE de linhas 'draft' para 'leader' ou 'admin'.

## 3. Regras Críticas
-   **Nenhuma** política terá `USING (true)` ou `WITH CHECK (true)`.
-   Nenhuma outra tabela terá seu RLS modificado.
-   A migration será transacional e garantirá a limpeza completa de políticas obsoletas (incluindo as prefixadas com `canonical_`).

## 4. Detalhes Técnicos (SQL)
```sql
-- Limpeza
DROP POLICY IF EXISTS "Equipes veem publicados ativos" ON public.procedimento_versoes;
DROP POLICY IF EXISTS "Líderes e admins veem tudo" ON public.procedimento_versoes;
DROP POLICY IF EXISTS "Líderes e admins inserem drafts" ON public.procedimento_versoes;
DROP POLICY IF EXISTS "Líderes e admins editam drafts" ON public.procedimento_versoes;
DROP POLICY IF EXISTS "Líderes e admins atualizam status histórico" ON public.procedimento_versoes;
DROP POLICY IF EXISTS "Líderes e admins deletam drafts" ON public.procedimento_versoes;
DROP POLICY IF EXISTS "canonical_versoes_select" ON public.procedimento_versoes;
DROP POLICY IF EXISTS "canonical_versoes_insert_draft" ON public.procedimento_versoes;
DROP POLICY IF EXISTS "canonical_versoes_update_draft" ON public.procedimento_versoes;
DROP POLICY IF EXISTS "canonical_versoes_delete_draft" ON public.procedimento_versoes;

-- 1. Equipes veem publicados ativos
CREATE POLICY "Equipes veem publicados ativos"
ON public.procedimento_versoes FOR SELECT
TO authenticated
USING (
  status = 'published' 
  AND vigencia_inicio <= CURRENT_DATE 
  AND (vigencia_fim IS NULL OR vigencia_fim > CURRENT_DATE)
);

-- 2. Líderes e admins veem tudo
CREATE POLICY "Líderes e admins veem tudo"
ON public.procedimento_versoes FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'leader'));

-- 3. Líderes e admins inserem drafts
CREATE POLICY "Líderes e admins inserem drafts"
ON public.procedimento_versoes FOR INSERT
TO authenticated
WITH CHECK (
  (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'leader'))
  AND status = 'draft'
);

-- 4. Líderes e admins editam drafts
CREATE POLICY "Líderes e admins editam drafts"
ON public.procedimento_versoes FOR UPDATE
TO authenticated
USING (
  (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'leader'))
  AND status = 'draft'
)
WITH CHECK (
  (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'leader'))
  AND status = 'draft'
);

-- 5. Líderes e admins atualizam status histórico
CREATE POLICY "Líderes e admins atualizam status histórico"
ON public.procedimento_versoes FOR UPDATE
TO authenticated
USING (
  (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'leader'))
  AND status IN ('published', 'suspended')
)
WITH CHECK (
  (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'leader'))
  AND status IN ('published', 'suspended', 'archived')
);

-- 6. Líderes e admins deletam drafts
CREATE POLICY "Líderes e admins deletam drafts"
ON public.procedimento_versoes FOR DELETE
TO authenticated
USING (
  (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'leader'))
  AND status = 'draft'
);
```
