# Plano de Correção Cirúrgica — Fase 1A (Identidade Interna e BYPASSRLS)

## Objetivo
Implementar uma identidade PostgreSQL dedicada com privilégios mínimos e BYPASSRLS para o fluxo de publicação de procedimentos, garantindo integridade absoluta sem o uso de GUCs ou flags de sessão.

## 1. Arquitetura de Identidade e RPC
- **Role Interna**: Criar o ROLE `internal_proc_executor` com as seguintes características:
  - `NOLOGIN`, `NOINHERIT`, `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`, `NOREPLICATION`.
  - **BYPASSRLS**: Esta role terá a capacidade de ignorar as políticas de RLS para realizar a transição `draft -> published` e o encerramento da versão anterior, superando a restrição `WITH CHECK status = 'draft'` da RLS de cliente.
- **Isolamento de Membership**:
  - NÃO haverá membership nem capacidade de `SET ROLE` para: `PUBLIC`, `anon`, `authenticated`, `authenticator`, `service_role`, `leader`, `admin`.
- **Privilégios Mínimos**:
  - `GRANT SELECT, UPDATE ON public.procedimento_versoes TO internal_proc_executor`.
  - `GRANT SELECT ON public.procedimentos TO internal_proc_executor`.
  - USAGE em schemas e EXECUTE em funções de auxílio (ex: `auth.uid()`, `has_role`).
  - **NENHUM** privilégio sobre tabelas operacionais (`equipes`, `servicos`, `outbox`, etc.).
- **RPC SECURITY DEFINER**: `public.publish_procedure_version` pertencerá a `internal_proc_executor`, operando com seus privilégios e BYPASSRLS.

## 2. Triggers de Integridade e Proteção
- **Trigger de Imutabilidade (SECURITY INVOKER)**:
  - Reconhecerá `current_user = 'internal_proc_executor'`.
  - Permitirá EXCLUSIVAMENTE:
    - **Caso A (Publicação)**: `OLD.status = draft`, `NEW.status = published`. Apenas campos de status e auditoria podem mudar.
    - **Caso B (Sucessão)**: `OLD.status = published`, `NEW.status = published`. Apenas `vigencia_fim` e auditoria podem mudar.
  - Qualquer outra mutação resultará em `RAISE EXCEPTION`.
- **Trigger Canônico de DELETE**:
  - `BEFORE DELETE ON public.procedimento_versoes`.
  - Se `OLD.status = 'draft'`: Permite (RLS validará `leader/admin`).
  - Se `OLD.status IN ('published', 'suspended', 'archived')`: Rejeita com `RAISE EXCEPTION` (proteção física permanente).

## 3. Sucessão e Lock (Mantido)
- **Lock Serializado**: `SELECT 1 FROM public.procedimentos WHERE id = ... FOR UPDATE`.
- **Validação JSONB**: Checagem completa da árvore (nodes, startNodeId, links, results).
- **Vigência**: `V1.vigencia_fim = V2.vigencia_inicio`. Rejeitar se `V2.vigencia_inicio <= V1.vigencia_inicio`.

## 4. Zona Protegida (PROIBIDO ALTERAR)
- `src/lib/sync/**`
- `src/lib/offline-auth.ts`
- `src/lib/sync/session-backup.ts`
- `src/lib/db/local-db.ts`
- `src/lib/db/repos.ts`
- `src/lib/db/catalogs.ts`
- `src/components/layout/SyncIndicator.tsx`
- `NetworkService`
- stores de conectividade
- diagnósticos
- alertas online/offline
- autenticação atual
- outbox
- `capacitor.config.ts`
- `mobile/**`
- `android/**`
- Home da equipe
- fluxo iniciar/continuar expediente
- serviços existentes
- tabelas operacionais existentes
- RLS das tabelas operacionais existentes
- **Restrição**: Não iniciar Fase 1B, Fase 2, IA ou cache offline.

## 5. Testes Bloqueantes Individuais
- **A.** draft → published direto rejeitado.
- **B.** RPC publica draft.
- **C.** published → suspended.
- **D.** published → archived.
- **E.** suspended → archived.
- **F.** status + conteúdo simultâneo rejeitado.
- **G.** published.vigencia_fim direto rejeitado.
- **H.** GUC não concede bypass.
- **I.** nenhuma autorização depende de GUC.
- **J.** startNodeId inválido rejeitado.
- **K.** result sem instruction rejeitado.
- **L.** answer sem nextNodeId rejeitada.
- **M.** nextNodeId inexistente rejeitado.
- **N.** concorrência serializada pelo procedimento.
- **O.** DELETE published bloqueado pelo trigger.
- **P.** DELETE suspended bloqueado.
- **Q.** DELETE archived bloqueado.
- **R.** PUBLIC sem EXECUTE da RPC.
- **S.** anon sem EXECUTE.
- **T.** authenticated só publica se leader/admin.
- **U.** zona protegida intacta.
- **V.** vigência futura não fecha V1 em now().
- **W.** fim V1 = início V2.
- **X.** nenhuma lacuna de vigência.
- **Y.** leader/admin veem drafts.
- **Z.** equipe não vê drafts/suspended/archived.
- **AA.** authenticated sem membership em internal_proc_executor.
- **AB.** anon sem membership em internal_proc_executor.
- **AC.** authenticator sem membership/SET ROLE.
- **AD.** service_role sem membership/SET ROLE.
- **AE.** chamada API normal não apresenta current_user internal_proc_executor.
- **AF.** publish_procedure_version executa como identidade interna dedicada.
- **AG.** identidade interna não consegue modificar conteúdo fora dos padrões A/B porque trigger rejeita.
- **AH.** existe exatamente um trigger de DELETE histórico.
- **AI.** leader/admin conseguem deletar draft.
- **AJ.** published/suspended/archived são rejeitados pelo trigger.
- **AK.** internal_proc_executor possui BYPASSRLS somente se o ambiente suportar a arquitetura aprovada.
- **AL.** internal_proc_executor possui somente os privilégios mínimos nas tabelas de procedimentos.
- **AM.** internal_proc_executor não possui privilégios sobre tabelas operacionais.
- **AN.** RPC SECURITY DEFINER consegue fazer draft → published apesar da RLS de cliente continuar bloqueando a mesma transição.
- **AO.** BYPASSRLS da role interna não permite violar o trigger de imutabilidade.

## Nota de Segurança
Se o ambiente Supabase não permitir criar o ROLE com `BYPASSRLS` conforme descrito, a execução será interrompida e a limitação reportada imediatamente.
