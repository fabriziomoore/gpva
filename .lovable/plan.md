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
1.  **Revogação de Membership**: Executar `REVOKE internal_proc_executor FROM postgres` para remover o vínculo onde `postgres` é membro de `internal_proc_executor`.
2.  **Limpeza Bidirecional**: Garantir que nenhum dos papéis seja membro do outro.
3.  **Proibições**:
    - Não usar `SET ROLE` ou `RESET ROLE`.
    - Não criar novos memberships.

## 4. Detalhes Técnicos (SQL)
```sql
-- Remoção de membership
REVOKE internal_proc_executor FROM postgres;
REVOKE postgres FROM internal_proc_executor;
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
