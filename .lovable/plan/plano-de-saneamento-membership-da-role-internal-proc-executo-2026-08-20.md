# Plano de Saneamento — Membership da Role internal_proc_executor

## 1. Objetivo Único
Remover integralmente qualquer vínculo de membership entre as roles PostgreSQL `postgres` e `internal_proc_executor`. O objetivo é garantir o isolamento da role e evitar heranças de privilégios não intencionais.

## 2. Escopo de Alteração
**Não serão alterados:**
- Row Level Security (RLS).
- Privilégios de tabelas ou colunas (GRANTs/REVOKEs de acesso).
- Funções (functions) ou Triggers.
- Frontend, mobile ou configurações Android.
- Lógica de Auth, Offline ou Sync.
- Dados operacionais das tabelas.

## 3. Implementação
A migration executará a seguinte ação em uma única transação:
1.  **Revogação de Membership**: Executar `REVOKE internal_proc_executor FROM postgres` de forma exaustiva. Como foram identificados dois registros (um com grantor `postgres` e outro com `supabase_admin`), a migration tentará remover ambos os vínculos.
2.  **Tratamento de Permissões**: Se o ambiente não permitir a remoção do grant originado pelo `supabase_admin`, a execução será **ABORTADA** e o erro reportado, sem tentativas de improviso ou alteração de contexto (como `SET ROLE`).
3.  **Proibições**:
    - Não usar `SET ROLE` ou `RESET ROLE`.
    - Não criar novos memberships.
    - Estado final obrigatório: 0 linhas em `pg_auth_members` para este par de roles.

## 4. Detalhes Técnicos (SQL)
```sql
-- Remoção explícita por grantor
REVOKE internal_proc_executor FROM postgres GRANTED BY postgres;
REVOKE internal_proc_executor FROM postgres GRANTED BY supabase_admin;
```

## 5. Validação Pós-Execução
Após a migration, a conformidade deve ser verificada via consulta aos catálogos do sistema:
```sql
SELECT count(*) 
FROM pg_auth_members 
WHERE (
    roleid = (SELECT oid FROM pg_roles WHERE rolname = 'internal_proc_executor')
    AND member = (SELECT oid FROM pg_roles WHERE rolname = 'postgres')
) OR (
    roleid = (SELECT oid FROM pg_roles WHERE rolname = 'postgres')
    AND member = (SELECT oid FROM pg_roles WHERE rolname = 'internal_proc_executor')
);
```
O resultado esperado é `0`.

---
**ESTADO: AGUARDANDO APROVAÇÃO**
**NÃO EXECUTAR ATÉ ORDEM EXPRESSA.**
