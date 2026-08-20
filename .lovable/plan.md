# Plano de Correção Cirúrgica — Fase 1A (Reforço Final e Semântica DATE)

## Objetivo
Implementar a identidade interna dedicada com BYPASSRLS, consolidar o trigger de imutabilidade em duas trilhas (interna/API) e converter os campos de vigência de `TIMESTAMPTZ` para `DATE` para garantir precisão civil e sucessão perfeita.

## 1. Identidade Interna e RPC
- **Role Dedicada**: Criar `internal_proc_executor` com `NOLOGIN`, `NOINHERIT`, `NOSUPERUSER`, `BYPASSRLS`.
- **Isolamento**: Sem membership para `PUBLIC`, `anon`, `authenticated`, `authenticator`, `service_role`, `leader`, `admin`.
- **RPC `SECURITY DEFINER`**: `public.publish_procedure_version` terá `OWNER = internal_proc_executor`.
- **BYPASSRLS**: Exclusivo para permitir a publicação (`draft -> published`) e encerramento da versão anterior ignorando a RLS restritiva de cliente.

## 2. Trigger de Imutabilidade (Duas Trilhas)
- **Trilha Interna** (`current_user = 'internal_proc_executor'`):
  - **Caso A (Publicação)**: Permite `OLD.status = draft` -> `NEW.status = published`. Apenas campos de status e auditoria podem mudar.
  - **Caso B (Sucessão)**: Permite `OLD.status = published` -> `NEW.status = published`. Apenas `vigencia_fim` e auditoria podem mudar.
- **Trilha Normal** (`current_user != 'internal_proc_executor'`):
  - Permite `published -> suspended`, `published -> archived`, `suspended -> archived`.
  - **Restrição**: Apenas `status`, `status_updated_at` e `status_alterado_por_id` podem mudar.
- **Proibições Globais**: Qualquer outra transição ou alteração de conteúdo operacional em versões não-draft resultará em `RAISE EXCEPTION`.

## 3. Semântica Temporal (Conversão para DATE)
- **Migração**: Converter `vigencia_inicio` e `vigencia_fim` de `TIMESTAMPTZ` para `DATE` na tabela `procedimento_versoes`.
- **Preservação**: Usar `AT TIME ZONE 'America/Sao_Paulo'` durante a conversão para manter a data civil correta.
- **Sucessão Perfeita**: `V1.vigencia_fim = V2.vigencia_inicio`. (Ex: V1 ativa em 14/09, V2 assume em 15/09).
- **Consultas**: Substituir `now()` por `CURRENT_DATE` na RLS e triggers.
- **Frontend**: Tratar `YYYY-MM-DD` diretamente, sem conversões UTC que causem deslocamento de dia.

## 4. Proteções Adicionais
- **Trigger DELETE**: Proteção física absoluta para versões `published`, `suspended` e `archived`.
- **Lock e Validação**: Lock serializado no procedimento pai e validação JSONB completa da árvore no backend.

## 5. Zona Protegida (PROIBIDO ALTERAR)
- `src/lib/sync/**`, `src/lib/offline-auth.ts`, `src/lib/sync/session-backup.ts`, `src/lib/db/local-db.ts`, `src/lib/db/repos.ts`, `src/lib/db/catalogs.ts`, `src/components/layout/SyncIndicator.tsx`, `NetworkService`, stores de conectividade, diagnósticos, alertas online/offline, autenticação atual, outbox, `capacitor.config.ts`, `mobile/**`, `android/**`, Home da equipe, fluxos de expediente, tabelas operacionais existentes e suas RLS.

## 6. Testes Bloqueantes Individuais
- **A-Z**: (RLS, RPC, Status, JSONB, Lock, Zona Protegida, Sucessão, Visibilidade).
- **AA-AO**: (Identidade Interna, Membership, SET ROLE, Bypass RLS).
- **AP-AS**: (Transições normais API: `published -> suspended/archived`, imutabilidade de conteúdo na API).
- **AT-AZ**: (Campos DATE, Timezone 'America/Sao_Paulo', Sucessão sem lacuna, Frontend sem conversão UTC).

## Nota Técnica
Se houver restrições no ambiente Supabase para criação de role com `BYPASSRLS` ou ownership da RPC, a execução será interrompida imediatamente para reavaliação.
