# Plano de Correção Cirúrgica — Fase 1A (Identidade Interna e Semântica DATE)

## Objetivo
Implementar a identidade interna dedicada com BYPASSRLS, consolidar a integridade via RLS e triggers (duas trilhas), converter campos de vigência para DATE e garantir a publicação atômica com validação backend rigorosa.

## 1. ROLE COMPLETA
Criar a ROLE `internal_proc_executor` com as seguintes características:
- `NOLOGIN`
- `NOINHERIT`
- `NOSUPERUSER`
- `NOCREATEDB`
- `NOCREATEROLE`
- `NOREPLICATION`
- `BYPASSRLS`
Sem membership e sem capacidade de `SET ROLE` para:
- `PUBLIC`
- `anon`
- `authenticated`
- `authenticator`
- `service_role`
- `leader`
- `admin`
- Qualquer outro papel usado por frontend/API.

## 2. PRIVILÉGIOS MÍNIMOS
`internal_proc_executor` terá somente:
- `SELECT`, `UPDATE` em `public.procedimento_versoes`
- `SELECT` em `public.procedimentos`
- `USAGE/EXECUTE` somente nas dependências indispensáveis da RPC.
Nenhum privilégio sobre:
- `equipes`
- `expedientes`
- `servicos`
- `impactos_expediente`
- `vinculos_complementos`
- `outbox`
- Ou qualquer outra tabela operacional.
Não usar privilégios genéricos em `public.*`.

## 3. RPC
`public.publish_procedure_version`:
- `SECURITY DEFINER`
- `OWNER = internal_proc_executor`
- `search_path` seguro.
- `REVOKE EXECUTE FROM PUBLIC, anon`
- `GRANT EXECUTE TO authenticated`
Dentro da RPC:
- `auth.uid() IS NOT NULL`
- Obrigatoriamente: `public.has_role(auth.uid(), 'leader')` OU `public.has_role(auth.uid(), 'admin')`
- Usuário `authenticated` sem uma dessas roles: **REJEITAR**.

## 4. RLS CANÔNICA
Remover policies antigas duplicadas/conflitantes na tabela `procedimento_versoes`.
- **SELECT EQUIPE**: `status = 'published' AND vigencia_inicio <= CURRENT_DATE AND (vigencia_fim IS NULL OR vigencia_fim > CURRENT_DATE)`
- **SELECT LEADER/ADMIN**: `leader/admin` visualizam `draft`, `published`, `suspended`, `archived`.
- **INSERT**: Somente `leader/admin` AND `status = 'draft'`.
- **UPDATE DRAFT**:
  - `USING`: `leader/admin` AND `status = 'draft'`
  - `WITH CHECK`: `leader/admin` AND `status = 'draft'`
  - **Nota**: `draft -> published` direto pela API é **PROIBIDO**.
- **UPDATE NÃO-DRAFT**: `published -> suspended`, `published -> archived`, `suspended -> archived` permitido somente para `leader/admin`.
- **DELETE**: Somente `leader/admin` AND `status = 'draft'`.
Não alterar RLS de tabelas operacionais.

## 5. TRIGGER DE IMUTABILIDADE
**TRILHA INTERNA** (`current_user = 'internal_proc_executor'`):
- **CASO A — PUBLICAÇÃO**:
  - `OLD.status = draft` -> `NEW.status = published`
  - SOMENTE podem mudar: `status`, `published_at`, `publicado_por_id`, `status_updated_at`, `status_alterado_por_id`. Nenhum outro campo.
- **CASO B — SUCESSÃO**:
  - `OLD.status = published` -> `NEW.status = published`
  - ÚNICO campo que pode mudar: `vigencia_fim`.
  - Não alterar: `status`, `status_updated_at`, `status_alterado_por_id`, `published_at`, `publicado_por_id` nem qualquer outro campo.

**TRILHA NORMAL** (`current_user != 'internal_proc_executor'`):
- `published -> suspended`, `published -> archived`, `suspended -> archived`.
- SOMENTE podem mudar: `status`, `status_updated_at`, `status_alterado_por_id`.
- Backend preenche: `status_updated_at = now()` e `status_alterado_por_id = auth.uid()`.
- Qualquer outra transição ou alteração simultânea de conteúdo: **REJEITAR**.

## 6. REMOVER GUC COMPLETAMENTE
Eliminar qualquer dependência de `app.internal_mutation`, `set_config(...)`, `current_setting(...)`, custom GUC ou flags de sessão.
- Não criar equivalente.
- Nenhuma função ou trigger pode usar esses mecanismos para autorização.

## 7. LOCK E ATOMICIDADE
A RPC deve executar exatamente:
1. Validar `auth.uid()`.
2. Validar `leader/admin`.
3. Localizar `procedimento_id` da versão alvo.
4. Executar `SELECT ... FOR UPDATE` em `public.procedimentos`.
5. Somente depois do lock, reler a versão alvo.
6. Confirmar novamente `status = 'draft'`.
7. Reler versão substituída.
8. Confirmar mesmo `procedimento_id`.
9. Validar vigência.
10. Validar árvore.
11. Fechar predecessor, se houver.
12. Publicar sucessora.
13. Concluir tudo atomicamente na mesma transação.

## 8. VALIDAÇÃO JSONB
Validar no backend:
- `jsonb_typeof(arvore_decisao) = 'object'`
- `nodes` existe e `jsonb_typeof(nodes) = 'array'` e não vazio.
- IDs dos nodes não vazios e únicos.
- `startNodeId` não vazio e existe em `nodes`.
- Pelo menos um node `type = 'result'` com `instruction` não vazia.
- Toda `question` possui `answers` (array não vazio).
- Toda `answer` possui `nextNodeId` não vazio e existe em `nodes`.
Frontend é somente camada adicional.

## 9. TRIGGER DELETE
Deve existir EXATAMENTE UM `BEFORE DELETE ON public.procedimento_versoes`:
- `OLD.status = 'draft'`: Permitir seguir para RLS.
- `OLD.status IN ('published', 'suspended', 'archived')`: **RAISE EXCEPTION**.
Eliminar triggers antigos duplicados dessa mesma responsabilidade.

## 10. DATE E OVERLAP
- Converter SOMENTE `public.procedimento_versoes.vigencia_inicio` e `public.procedimento_versoes.vigencia_fim` de `TIMESTAMPTZ` para `DATE`.
- Preservar data civil usando `America/Sao_Paulo` após verificar os dados existentes.
- Sem conversão cega e sem alterar datas de tabelas operacionais.
- **Semântica**: `[vigencia_inicio, vigencia_fim)` onde `vigencia_fim` é limite exclusivo (NULL = aberto).
- Equipe usa `CURRENT_DATE`. Não usar `now()` para vigência nem `- INTERVAL '1 day'`.
- **Sucessão**: `V1.vigencia_fim = V2.vigencia_inicio`.
- **Frontend**: `YYYY-MM-DD` direto, sem conversão UTC para esses campos.

## 11. ZONA PROTEGIDA (PROIBIDO ALTERAR)
- `src/lib/sync/**`
- `src/lib/offline-auth.ts`
- `src/lib/sync/session-backup.ts`
- `src/lib/db/local-db.ts`
- `src/lib/db/repos.ts`
- `src/lib/db/catalogs.ts`
- `src/components/layout/SyncIndicator.tsx`
- `NetworkService`
- Stores de conectividade
- Diagnósticos
- Alertas online/offline
- Autenticação atual
- Outbox
- `capacitor.config.ts`
- `mobile/**`
- `android/**`
- Home da equipe
- Fluxo iniciar/continuar expediente
- Serviços existentes
- Tabelas operacionais existentes
- RLS das tabelas operacionais existentes
Não iniciar Fase 1B, Fase 2, cache offline ou IA.

## 12. TESTES
**A.** draft -> published direto rejeitado pela RLS.
**B.** RPC publica draft corretamente.
**C.** published -> suspended funciona via API.
**D.** published -> archived funciona via API.
**E.** suspended -> archived funciona via API.
**F.** status + conteúdo operacional simultâneo rejeitado no UPDATE.
**G.** published.vigencia_fim direto via API é rejeitado.
**H.** Tentativa de manipular GUC não concede bypass.
**I.** Nenhuma autorização depende de GUC.
**J.** startNodeId inválido rejeitado no backend.
**K.** result sem instruction rejeitado no backend.
**L.** answer sem nextNodeId rejeitada no backend.
**M.** nextNodeId inexistente rejeitado no backend.
**N.** Concorrência serializada pelo lock no procedimento.
**O.** DELETE de published bloqueado pelo trigger.
**P.** DELETE de suspended bloqueado pelo trigger.
**Q.** DELETE de archived bloqueado pelo trigger.
**R.** PUBLIC sem EXECUTE da RPC.
**S.** anon sem EXECUTE da RPC.
**T.** authenticated só publica se leader/admin.
**U.** Zona protegida intacta.
**V.** Vigência futura não fecha V1 em now().
**W.** Fim V1 = início V2.
**X.** Nenhuma lacuna de vigência na sucessão.
**Y.** Leader/admin veem drafts.
**Z.** Equipe não vê drafts/suspended/archived.
**AA.** authenticated sem membership em internal_proc_executor.
**AB.** anon sem membership em internal_proc_executor.
**AC.** authenticator sem membership/SET ROLE para internal_proc_executor.
**AD.** service_role sem membership/SET ROLE para internal_proc_executor.
**AE.** Chamada API normal não apresenta current_user = internal_proc_executor.
**AF.** publish_procedure_version executa como identidade interna dedicada.
**AG.** Identidade interna não consegue modificar conteúdo fora dos padrões autorizados (Trilha A/B).
**AH.** Existe exatamente um trigger de DELETE histórico.
**AI.** Leader/admin conseguem deletar draft.
**AJ.** Deleção física de published/suspended/archived rejeitada pelo trigger.
**AK.** internal_proc_executor possui BYPASSRLS (se suportado).
**AL.** internal_proc_executor possui somente privilégios mínimos em procedimentos.
**AM.** internal_proc_executor não possui privilégios sobre tabelas operacionais.
**AN.** RPC SECURITY DEFINER faz draft -> published apesar da RLS.
**AO.** BYPASSRLS não permite violar imutabilidade do trigger.
**AP.** published -> suspended continua funcionando com novo trigger.
**AQ.** published -> archived continua funcionando.
**AR.** suspended -> archived continua funcionando.
**AS.** Nessas três transições, somente status/auditoria podem mudar.
**AT.** vigencia_inicio e vigencia_fim são DATE.
**AU.** 2026-09-15 nunca vira 2026-09-14 por timezone.
**AV.** V1 ativa durante 2026-09-14.
**AW.** V1 inativa em 2026-09-15.
**AX.** V2 ativa em 2026-09-15.
**AY.** Sucessão não cria lacuna entre V1 e V2.
**AZ.** Frontend não usa conversão UTC para campos DATE de Procedimentos.
**BA.** Durante sucessão V1 published -> V1 published com fechamento de vigencia_fim, somente vigencia_fim é alterado; status_updated_at e status_alterado_por_id permanecem exatamente iguais.

## 13. EXECUÇÃO FUTURA
- Criar somente NOVA migration; não editar migrations aplicadas.
- Se o ambiente impedir `internal_proc_executor`, `BYPASSRLS`, `OWNER` da RPC ou conversão segura para `DATE`, **PARAR E REPORTAR**.
- NÃO improvisar.
