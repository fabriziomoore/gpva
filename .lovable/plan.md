# Plano de Saneamento — Permissões da Role internal_proc_executor

## 1. Objetivo Único
Sanear exclusivamente os privilégios da role PostgreSQL `internal_proc_executor` no schema `public`. O objetivo é garantir o princípio do menor privilégio necessário para a operação da RPC de publicação de procedimentos.

## 2. Escopo de Alteração
**Não serão alterados:**
- Row Level Security (RLS) de qualquer tabela.
- Funções (functions) ou Triggers.
- Frontend, mobile ou configurações Android.
- Estrutura de tabelas ou dados existentes.
- Lógica de Auth, Offline ou Sync.

## 3. Implementação
A migration executará as seguintes ações em uma única transação:
1.  **Revogação**: Remover todos os privilégios atuais da role `internal_proc_executor` nas tabelas `procedimentos` e `procedimento_versoes` para garantir um estado limpo.
2.  **Privilégios em `procedimento_versoes`**:
    -   Conceder `SELECT` (para leitura da versão a ser publicada).
    -   Conceder `UPDATE` (para alterar o status de 'draft' para 'published', 'suspended' ou 'archived').
    -   **Remover/Não conceder**: `INSERT` e `DELETE`.
3.  **Privilégios em `procedimentos`**:
    -   Conceder `SELECT` (para verificação de existência).
    -   Conceder `UPDATE` **apenas na coluna `id`** (estritamente necessário para realizar `SELECT FOR UPDATE` e garantir o lock atômico, conforme documentação do PostgreSQL).
    -   **Não conceder**: `UPDATE` amplo em outras colunas.
4.  **Schema**:
    -   Manter `USAGE` no schema `public`.

## 4. Detalhes Técnicos (SQL)
```sql
-- 1. Limpeza de privilégios existentes
REVOKE ALL ON public.procedimento_versoes FROM internal_proc_executor;
REVOKE ALL ON public.procedimentos FROM internal_proc_executor;

-- 2. Concessão mínima em procedimento_versoes
GRANT SELECT, UPDATE ON public.procedimento_versoes TO internal_proc_executor;

-- 3. Concessão mínima em procedimentos
GRANT SELECT ON public.procedimentos TO internal_proc_executor;
GRANT UPDATE (id) ON public.procedimentos TO internal_proc_executor;

-- 4. Garantia de acesso ao schema
GRANT USAGE ON SCHEMA public TO internal_proc_executor;
```

## 5. Validação Pós-Execução
Após a migration, a conformidade deve ser verificada via consultas de metadados:
-   `has_table_privilege('internal_proc_executor', 'public.procedimento_versoes', 'INSERT')` deve ser `false`.
-   `has_table_privilege('internal_proc_executor', 'public.procedimento_versoes', 'DELETE')` deve ser `false`.
-   `has_column_privilege('internal_proc_executor', 'public.procedimentos', 'id', 'UPDATE')` deve ser `true`.
-   `has_column_privilege('internal_proc_executor', 'public.procedimentos', 'nome_logico', 'UPDATE')` deve ser `false`.
-   `has_column_privilege('internal_proc_executor', 'public.procedimentos', 'responsavel_id', 'UPDATE')` deve ser `false`.
-   `has_column_privilege('internal_proc_executor', 'public.procedimentos', 'created_at', 'UPDATE')` deve ser `false`.
-   `has_column_privilege('internal_proc_executor', 'public.procedimentos', 'updated_at', 'UPDATE')` deve ser `false`.

---
**ESTADO: AGUARDANDO APROVAÇÃO**
**NÃO EXECUTAR ATÉ ORDEM EXPRESSA.**
