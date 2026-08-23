---
name: Plano de Correção Cirúrgica - Remoção de Helper/GUC Legado
description: Plano para remover a função private.internal_close_superseded_version e limpar referências a GUCs legados.
type: constraint
---

# CORREÇÃO CIRÚRGICA — REMOÇÃO DO HELPER/GUC LEGADO

**Objetivo único:**
Remover o helper legado `private.internal_close_superseded_version(uuid, timestamp with time zone, uuid)`.

**Estado atual confirmado:**
- A função existe no schema `private`.
- Owner: `postgres`.
- `SECURITY DEFINER = true`.
- Contém `set_config('app.internal_mutation', ...)`.
- Não possui dependências registradas em `pg_depend`.
- Nenhuma outra função em `public` ou `private` chama este helper.

**Não alterar:**
- RLS
- Roles / Memberships
- Triggers
- `publish_procedure_version`
- Frontend / Mobile / Android
- Auth / Offline / Sync
- Tabelas ou dados existentes

**Protocolo da Migration:**
1. Remover SOMENTE a função com assinatura exata: `DROP FUNCTION private.internal_close_superseded_version(uuid, timestamp with time zone, uuid);`
2. **NÃO** usar `CASCADE`.
3. Se existir qualquer dependência inesperada no momento da execução: **ABORTAR e REPORTAR**.
4. Não criar função substituta.
5. Não criar ou utilizar GUCs.
6. Não usar `set_config` ou `current_setting` para `app.internal_mutation`.
7. Criar somente **UMA** nova migration.

**Validação Pós-Execução (Read-Only):**
- Confirmar que a função `private.internal_close_superseded_version` não existe mais.
- Confirmar que nenhuma função nos schemas `public` ou `private` contém as strings `app.internal_mutation` ou `set_config` relacionado a `internal_mutation`.

**NÃO FAZER NENHUMA OUTRA CORREÇÃO.**
**NÃO EXECUTAR SEM APROVAÇÃO.**
