# Plano de Saneamento — Fase 1A (Correção Cirúrgica Pós-Auditoria)

NÃO iniciar Fase 1B ou Fase 2. Criar UMA NOVA migration corretiva de saneamento.

## 1. Viabilidade do Owner — Bloqueante
Antes de consolidar a arquitetura, a migration deve garantir que o estado final seja:
- `public.publish_procedure_version(uuid, date, uuid)`
- `SECURITY DEFINER`
- `OWNER = internal_proc_executor`
- SEM `SET ROLE`, `RESET ROLE`, GUCs, `service_role` como executor ou owner `postgres` como alternativa.
- O ESTADO FINAL não pode depender de membership permanente. Se impossível, a migration deve ser ABORTADA.

## 2. Configuração de Role e Membership
- **Role**: `internal_proc_executor` deve ser `NOLOGIN`, `NOINHERIT`, `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`, `NOREPLICATION`, `BYPASSRLS`.
- **Privilégios Mínimos**: `SELECT, UPDATE` em `procedimento_versoes`; `SELECT` em `procedimentos`; `UPDATE(id)` em `procedimentos`; `USAGE` no schema `public`; `EXECUTE` em funções indispensáveis (incluindo `has_role`).
- **Membership**: Remover membership de `anon`, `authenticated`, `authenticator`, `service_role`, `leader`, `admin`. Remover `postgres -> internal_proc_executor` após configuração de ownership.

## 3. Eliminação de Legados
- **RPC**: Remover `public.publish_procedure_version(uuid)`.
- **Helpers**: Remover `private.internal_close_superseded_version` se confirmado uso exclusivo legado.
- **Triggers**: Remover `trigger_immutability_final` e `public.trg_enforce_versao_immutability()`.
- **GUC**: Nenhuma função ativa pode conter `app.internal_mutation`, `set_config`, `current_setting`.

## 4. RPC Canônica e Lock
Assinatura: `public.publish_procedure_version(p_versao_id uuid, p_vigencia_inicio date, p_substitui_versao_id uuid DEFAULT NULL)`.
Sequência Obrigatória:
1. Validar `auth.uid()` e `leader/admin`.
2. `SELECT ... FOR UPDATE` em `public.procedimentos` para lock serializado.
3. Reler draft, confirmar `status = 'draft'`.
4. Reler predecessor (usar `substitui_versao_id` persistido no draft).
5. Validar árvore JSONB (unicidade de IDs, integridade estrutural, nodes existentes).
6. Fechar predecessor (`V1.vigencia_fim = V2.vigencia_inicio`).
7. Publicar sucessora.

## 5. Trigger de Imutabilidade (Whitelist Exata)
Função `check_procedimento_versao_integrity` deve ser `SECURITY INVOKER`.
- **Caso A (Privilegiado - Publicação)**: `OLD.status = draft` -> `NEW.status = published`. Whitelist: `status`, `published_at`, `publicado_por_id`, `status_updated_at`, `status_alterado_por_id`. Comparar TODOS os demais campos.
- **Caso B (Privilegiado - Sucessão)**: `OLD.status = published` -> `NEW.status = published`. ÚNICO campo alterável: `vigencia_fim`.
- **Trilha Normal**: Permitir somente `published -> suspended`, `published -> archived`, `suspended -> archived`. Whitelist: `status`, `status_updated_at`, `status_alterado_por_id`. Bloquear `draft -> published` e mudanças de conteúdo.

## 6. RLS Canônica (procedimento_versoes)
Remover nominalmente todas as legadas. Manter apenas estas 6:
1. **Equipes**: SELECT published ativos (`vigencia_inicio <= CURRENT_DATE` AND open/future `vigencia_fim`).
2. **Líderes/Admins**: SELECT tudo.
3. **Líderes/Admins**: INSERT status='draft'.
4. **Líderes/Admins**: UPDATE status='draft'.
5. **Líderes/Admins**: UPDATE status histórico (`published -> suspended/archived`).
6. **Líderes/Admins**: DELETE status='draft'.

## 7. JSONB e DATE
- **JSONB**: Validar no backend `COUNT(nodes) = COUNT(DISTINCT node.id)`, `startNodeId` existente, `result` com `instruction`, `answers` com `nextNodeId` existente.
- **DATE**: `check_vigencia_overlap` deve usar apenas `DATE`. Semântica `[início, fim)`. Sem `TIMESTAMPTZ` ou `now()`.
- **Frontend**: Ajustar `leader-procedures.tsx` para formatar `YYYY-MM-DD` sem deslocamento de timezone (ex: 2026-09-15 -> 15/09/2026).

## 8. Testes Bloqueantes
PRESERVAR A-BG. Listar individualmente:
BH. Única assinatura RPC publish.
BI. Sem RPC legada (uuid).
BJ. Sem app.internal_mutation.
BK. Sem set_config.
BL. Sem current_setting.
BM. RPC sem SET ROLE/RESET ROLE.
BN. RPC OWNER = internal_proc_executor.
BO. Trigger SECURITY INVOKER.
BP. Trigger enxerga internal_proc_executor na RPC.
BQ. Trigger não enxerga role interna em UPDATE normal.
BR. Único trigger canônico.
BS. Sem policy legada "Líderes podem editar rascunhos".
BT. Sem draft -> published direto via RLS.
BU. IDs duplicados JSONB rejeitados.
BV. Publicação não muda vigencia_inicio.
BW. Sucessão usa ID persistido no draft.
BX. Predecessor fecha exatamente em sucessor.
BY. Frontend sem timezone em DATE.
BZ. Role interna sem membership de anon/auth/authenticator/service_role/leader/admin.
CA. RPC funciona sem membership de postgres.
CB. Types sem assinatura obsoleta.
CC. Zona protegida intacta.

## 9. Parada Obrigatória
Se não for possível atingir o estado de OWNER/SECURITY DEFINER sem membership permanente ou GUCs: ABORTAR. NÃO IMPROVISAR.
