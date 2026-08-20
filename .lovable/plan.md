# Plano de Correção Cirúrgica — Fase 1A (Reforço Documental e Integridade Final)

## Objetivo
Implementar a identidade interna dedicada com BYPASSRLS, consolidar a integridade via triggers (duas trilhas) e garantir a semântica de datas civis (DATE) para vigência e sucessão perfeita de procedimentos.

## 1. Role PostgreSQL Completa
- **Identidade**: Criar ROLE `internal_proc_executor`.
- **Configuração**: `NOLOGIN`, `NOINHERIT`, `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`, `NOREPLICATION`, `BYPASSRLS`.
- **Isolamento**: Sem membership e sem capacidade de `SET ROLE` para: `PUBLIC`, `anon`, `authenticated`, `authenticator`, `service_role`, `leader`, `admin` ou qualquer outro papel de cliente/API.

## 2. Privilégios Mínimos
- ** internal_proc_executor**:
  - `GRANT SELECT, UPDATE ON public.procedimento_versoes`.
  - `GRANT SELECT ON public.procedimentos`.
  - `USAGE/EXECUTE` apenas em funções/schemas indispensáveis para `auth.uid()` e `public.has_role(...)`.
- **Proibição**: Sem privilégios sobre `equipes`, `expedientes`, `servicos`, `impactos_expediente`, `vinculos_complementos`, `outbox` ou qualquer outra tabela operacional.

## 3. Matriz de Imutabilidade (Triggers)
- **Trilha Interna** (`current_user = 'internal_proc_executor'`):
  - **Caso A (Publicação)**: `OLD.status = draft` -> `NEW.status = published`. Somente mudam: `status`, `published_at`, `publicado_por_id`, `status_updated_at`, `status_alterado_por_id`.
  - **Caso B (Sucessão)**: `OLD.status = published` -> `NEW.status = published`. Somente mudam: `vigencia_fim`, `status_updated_at`, `status_alterado_por_id`.
- **Trilha Normal** (`current_user != 'internal_proc_executor'`):
  - Permite `published -> suspended`, `published -> archived`, `suspended -> archived`.
  - Somente mudam: `status`, `status_updated_at`, `status_alterado_por_id`.
  - Backend preenche auditoria via `now()` e `auth.uid()`.

## 4. Semântica DATE e Sucessão
- **Migração**: Converter `vigencia_inicio` e `vigencia_fim` para `DATE`.
- **Conversão**: Usar `AT TIME ZONE 'America/Sao_Paulo'` para preservar a data civil.
- **Consultas**: Usar `CURRENT_DATE`.
- **Sucessão**: `V1.vigencia_fim = V2.vigencia_inicio`.
- **Frontend**: Tratar `YYYY-MM-DD` diretamente sem conversão UTC.

## 5. Zona Protegida (PROIBIDO ALTERAR)
- `src/lib/sync/**`, `src/lib/offline-auth.ts`, `src/lib/sync/session-backup.ts`, `src/lib/db/local-db.ts`, `src/lib/db/repos.ts`, `src/lib/db/catalogs.ts`, `src/components/layout/SyncIndicator.tsx`, `NetworkService`, stores de conectividade, diagnósticos, alertas online/offline, autenticação atual, outbox, `capacitor.config.ts`, `mobile/**`, `android/**`, Home da equipe, fluxo iniciar/continuar expediente, serviços existentes, tabelas operacionais existentes e suas RLS.
- Nenhuma Fase 1B, Fase 2, cache offline ou IA.

## 6. Testes Bloqueantes Individuais
- **A.** draft → published direto rejeitado pela RLS.
- **B.** RPC publica draft corretamente.
- **C.** published → suspended funciona via API.
- **D.** published → archived funciona via API.
- **E.** suspended → archived funciona via API.
- **F.** status + conteúdo operacional simultâneo rejeitado no UPDATE.
- **G.** published.vigencia_fim direto via API é rejeitado.
- **H.** Tentativa de manipular GUC não concede bypass.
- **I.** Nenhuma autorização depende de GUC.
- **J.** startNodeId inválido rejeitado no backend.
- **K.** result sem instruction rejeitado no backend.
- **L.** answer sem nextNodeId rejeitada no backend.
- **M.** nextNodeId inexistente rejeitado no backend.
- **N.** Concorrência serializada pelo lock no procedimento.
- **O.** DELETE de published bloqueado pelo trigger.
- **P.** DELETE de suspended bloqueado pelo trigger.
- **Q.** DELETE de archived bloqueado pelo trigger.
- **R.** PUBLIC sem EXECUTE da RPC.
- **S.** anon sem EXECUTE da RPC.
- **T.** authenticated só publica se leader/admin.
- **U.** Zona protegida intacta.
- **V.** Vigência futura não fecha V1 em now().
- **W.** Fim V1 = início V2.
- **X.** Nenhuma lacuna de vigência na sucessão.
- **Y.** Leader/admin veem drafts.
- **Z.** Equipe não vê drafts/suspended/archived.
- **AA.** authenticated sem membership em internal_proc_executor.
- **AB.** anon sem membership em internal_proc_executor.
- **AC.** authenticator sem membership/SET ROLE para internal_proc_executor.
- **AD.** service_role sem membership/SET ROLE para internal_proc_executor.
- **AE.** Chamada API normal não apresenta current_user = internal_proc_executor.
- **AF.** publish_procedure_version executa como identidade interna dedicada.
- **AG.** Identidade interna não consegue modificar conteúdo fora dos padrões autorizados (Trilha A/B).
- **AH.** Existe exatamente um trigger de DELETE histórico.
- **AI.** Leader/admin conseguem deletar draft.
- **AJ.** Deleção física de published/suspended/archived rejeitada pelo trigger.
- **AK.** internal_proc_executor possui BYPASSRLS (se suportado).
- **AL.** internal_proc_executor possui somente privilégios mínimos em procedimentos.
- **AM.** internal_proc_executor não possui privilégios sobre tabelas operacionais.
- **AN.** RPC SECURITY DEFINER faz draft → published apesar da RLS.
- **AO.** BYPASSRLS não permite violar imutabilidade do trigger.
- **AP.** published → suspended continua funcionando com novo trigger.
- **AQ.** published → archived continua funcionando.
- **AR.** suspended → archived continua funcionando.
- **AS.** Nessas três transições, somente status/auditoria podem mudar.
- **AT.** vigencia_inicio e vigencia_fim são DATE.
- **AU.** 2026-09-15 nunca vira 2026-09-14 por timezone.
- **AV.** V1 ativa durante 2026-09-14.
- **AW.** V1 inativa em 2026-09-15.
- **AX.** V2 ativa em 2026-09-15.
- **AY.** Sucessão não cria lacuna entre V1 e V2.
- **AZ.** Frontend não usa conversão UTC para campos DATE de Procedimentos.

## Nota de Execução
Caso existam limitações no ambiente para a criação da ROLE, BYPASSRLS ou conversão segura para DATE, a execução será interrompida e reportada.
