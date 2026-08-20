# Plano de Correção Cirúrgica — Fase 1A (Consolidação Documental e Integridade Final)

## Objetivo
Implementar a identidade interna dedicada com BYPASSRLS, consolidar a integridade via RLS e triggers (duas trilhas), converter campos de vigência para DATE e garantir a publicação atômica com validação backend rigorosa.

## 1. Role PostgreSQL e RPC
- **Identidade**: Criar ROLE `internal_proc_executor` (`NOLOGIN`, `NOINHERIT`, `NOSUPERUSER`, `NOREPLICATION`, `BYPASSRLS`).
- **Isolamento**: Sem membership em roles de cliente (`anon`, `authenticated`, `service_role`).
- **Privilégios**: `GRANT SELECT, UPDATE ON procedimento_versoes`, `GRANT SELECT ON procedimentos`. Sem acesso a tabelas operacionais.
- **RPC `public.publish_procedure_version`**:
    - `SECURITY DEFINER` com `OWNER = internal_proc_executor`.
    - `SET search_path = public`.
    - `REVOKE EXECUTE ON FUNCTION ... FROM PUBLIC, anon`.
    - `GRANT EXECUTE ON FUNCTION ... TO authenticated`.
    - **Validação Interna**: Exigir `auth.uid()` e `has_role(auth.uid(), 'leader' | 'admin')`.

## 2. RLS Canônica (`procedimento_versoes`)
Remover policies duplicadas e manter:
- **SELECT EQUIPE**: `status = 'published' AND vigencia_inicio <= CURRENT_DATE AND (vigencia_fim IS NULL OR vigencia_fim > CURRENT_DATE)`.
- **SELECT LEADER/ADMIN**: Ver `draft`, `published`, `suspended`, `archived`.
- **INSERT**: Somente `leader/admin` e `status = 'draft'`.
- **UPDATE DRAFT**: Somente `leader/admin`, `OLD.status = 'draft'` e `NEW.status = 'draft'`. (Impede publicação direta via API).
- **UPDATE STATUS (Não-Draft)**: Somente `leader/admin` para transições `published -> suspended/archived` e `suspended -> archived`. Apenas campos `status`, `status_updated_at`, `status_alterado_por_id` podem mudar.
- **DELETE**: Somente `leader/admin` e `status = 'draft'`.

## 3. Matriz de Imutabilidade e Triggers
- **Trilha Interna** (`current_user = 'internal_proc_executor'`):
    - **Caso A (Publicação)**: `draft -> published`. Muda `status`, `published_at`, `publicado_por_id`, auditoria.
    - **Caso B (Sucessão)**: `published -> published`. **ÚNICO campo alterável: `vigencia_fim`**. Não altera status ou auditoria de status.
- **Trilha Normal** (`current_user != 'internal_proc_executor'`):
    - Permite transições de status aprovadas. Bloqueia alteração de conteúdo operacional.
- **Trigger DELETE**: Rejeita deleção física se `status != 'draft'`.
- **Remoção de GUC**: Proibido usar `app.internal_mutation` ou similares. A identidade é verificada via `current_user`.

## 4. Atomicidade e Validação Backend
A RPC deve seguir esta ordem:
1. Validar `auth.uid()` e roles `leader/admin`.
2. `SELECT FOR UPDATE` em `public.procedimentos` para garantir serialização.
3. Reler e validar versão alvo (`status = 'draft'`) e predecessor (mesmo procedimento, vigência coerente).
4. **Validação JSONB**:
    - `arvore_decisao` é objeto; `nodes` é array não vazio com IDs únicos.
    - `startNodeId` válido.
    - Pelo menos um node `type = 'result'` com `instruction`.
    - `question` tem `answers` (array não vazio); `answer` tem `nextNodeId` apontando para node existente.
5. Fechar predecessor (`V1.vigencia_fim = V2.vigencia_inicio`) e publicar sucessora atomicamente.

## 5. Semântica DATE
- **Migração**: Converter `vigencia_inicio` e `vigencia_fim` para `DATE` usando `AT TIME ZONE 'America/Sao_Paulo'`.
- **Lógica**: Intervalo `[vigencia_inicio, vigencia_fim)`. Usar `CURRENT_DATE`.
- **Frontend**: Enviar/receber `YYYY-MM-DD` sem conversões UTC.

## 6. Zona Protegida e Testes
- **Zona Protegida**: `sync`, `offline-auth`, `capacitor.config.ts`, `mobile/**`, `equipes`, `servicos`, etc.
- **Testes (A–BA)**:
    - **A–AZ**: Todos os 52 testes anteriores individualizados.
    - **BA**: Durante sucessão, somente `vigencia_fim` muda; `status_updated_at` e `status_alterado_por_id` permanecem intactos.

## Nota de Execução
- Se o ambiente impedir criação de role, `BYPASSRLS`, ownership da RPC ou conversão de `DATE`, **PARAR E REPORTAR**.
- Apenas **NOVA migration**. Não improvisar.
