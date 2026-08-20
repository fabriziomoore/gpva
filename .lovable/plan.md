# Plano de Correção Cirúrgica — Fase 1A (Reforço de Integridade e Segurança)

## Objetivo
Reforçar a integridade do sistema de procedimentos, eliminando vulnerabilidades de autorização baseadas em GUC, corrigindo falhas na RLS e garantindo sucessão cronológica perfeita via backend.

## 1. Autorização Interna Estrutural
- **Mecanismo de Segurança**: Criar um papel interno PostgreSQL `internal_proc_executor` sem permissão de LOGIN.
- **Isolamento**: As permissões de `authenticated` e `anon` serão explicitamente negadas para este papel (`NOINHERIT`). Ninguém poderá fazer `SET ROLE internal_proc_executor` exceto através do contexto de execução da RPC `SECURITY DEFINER`.
- **Implementação**:
  - A RPC `publish_procedure_version` será `SECURITY DEFINER` e pertencerá a um superuser ou ao owner da tabela, executando com o contexto necessário.
  - O trigger de imutabilidade verificará `SESSION_USER` vs `CURRENT_USER`. Se `CURRENT_USER` for o owner do banco/papel interno e `SESSION_USER` for o usuário logado, o trigger permitirá a alteração EXCLUSIVA do campo `vigencia_fim` durante a sucessão.
  - **Proibição Absoluta**: Sem `set_config`, `current_setting`, ou qualquer flag de sessão.

## 2. RLS e Controle de Status
- **Políticas de SELECT**:
  - **Equipe**: `USING (status = 'published' AND vigencia_inicio <= now() AND (vigencia_fim IS NULL OR vigencia_fim > now()))`.
  - **Leader/Admin**: `USING (public.has_role(auth.uid(), 'leader') OR public.has_role(auth.uid(), 'admin'))` (Permite ver drafts, suspended, archived).
- **Políticas de UPDATE**:
  - **Edição de Draft**: `USING (leader/admin AND status = 'draft') WITH CHECK (leader/admin AND status = 'draft')`. (Bloqueia `draft -> published` via cliente).
  - **Alteração de Status Não-Draft**: `USING (leader/admin AND status IN ('published', 'suspended')) WITH CHECK (leader/admin AND status IN ('suspended', 'archived'))`.
- **Validação de Matriz de Status (Trigger)**:
  - `published -> suspended`: OK.
  - `published -> archived`: OK.
  - `suspended -> archived`: OK.
  - **Restrição**: Durante estas transições, o trigger falhará se qualquer campo operacional for alterado simultaneamente com o status.

## 3. Sucessão Cronológica e Vigência
- **Sincronia Perfeita**: Ao publicar a Versão 2 (V2), se ela substituir a Versão 1 (V1), `V1.vigencia_fim` será definida exatamente como `V2.vigencia_inicio`.
- **Sem Lacunas**: Isso garante que V1 vale até o milissegundo anterior ao início de V2.
- **Validação**: A publicação será rejeitada se `V2.vigencia_inicio <= V1.vigencia_inicio`.

## 4. Lock e Atomicidade (RPC)
A RPC `publish_procedure_version` seguirá rigorosamente:
1. Validar `auth.uid()` e papel `leader/admin`.
2. Obter `procedimento_id` da versão alvo.
3. **Lock Serializado**: `SELECT 1 FROM public.procedimentos WHERE id = v_proc_id FOR UPDATE`.
4. Reler o estado da versão após o lock.
5. Validar estado (`draft`) e versão substituída.
6. Executar fechamento da versão anterior (V1.vigencia_fim = V2.vigencia_inicio).
7. Publicar nova versão (`status = 'published'`, `published_at = now()`).
8. Commit.

## 5. Validação Backend da Árvore (JSONB)
A RPC validará a estrutura `arvore_decisao`:
- `jsonb_typeof(arvore_decisao) = 'object'`.
- `nodes` existe e é `array` não vazio.
- IDs dos nodes não vazios e únicos.
- `startNodeId` não vazio e presente em `nodes`.
- Pelo menos um nó com `type = 'result'`.
- Todo nó `result` tem `instruction` não vazia.
- Toda `question` tem `answers` array não vazio.
- Toda `answer` tem `nextNodeId` não vazio e apontando para um nó existente na árvore.

## 6. Zona Protegida (PROIBIDO ALTERAR)
- `src/lib/sync/**`, `src/lib/offline-auth.ts`, `src/lib/sync/session-backup.ts`, `src/lib/db/local-db.ts`, `src/lib/db/repos.ts`, `src/lib/db/catalogs.ts`, `src/components/layout/SyncIndicator.tsx`, `NetworkService`, stores de conectividade, diagnósticos, alertas online/offline, autenticação atual, outbox, `capacitor.config.ts`, `mobile/**`, `android/**`, Home da equipe, iniciar/continuar expediente, serviços existentes, tabelas operacionais existentes e RLS das mesmas.

## 7. Testes Bloqueantes
- **A.** UPDATE direto draft -> published é rejeitado pela RLS.
- **B.** publish_procedure_version publica draft corretamente.
- **C.** published -> suspended funciona.
- **D.** published -> archived funciona.
- **E.** suspended -> archived funciona.
- **F.** Conteúdo + mudança de status no mesmo UPDATE é rejeitado.
- **G.** UPDATE normal de published.vigencia_fim é rejeitado.
- **H.** Tentativa de manipular GUC não concede bypass.
- **I.** Autorização não depende de GUC.
- **J.** startNodeId inexistente é rejeitado no backend.
- **K.** result sem instruction é rejeitado no backend.
- **L.** answer sem nextNodeId é rejeitada no backend.
- **M.** nextNodeId apontando para node inexistente é rejeitado.
- **N.** Publicações simultâneas serializadas pelo lock no procedimento.
- **O.** DELETE de published é rejeitado pelo trigger.
- **P.** DELETE de suspended é rejeitado pelo trigger.
- **Q.** DELETE de archived é rejeitado pelo trigger.
- **R.** PUBLIC não executa RPC.
- **S.** anon não executa RPC.
- **T.** authenticated executa RPC, mas valida leader/admin internamente.
- **U.** Zona protegida intacta.
- **V.** V2 com vigência futura NÃO encerra V1 em now().
- **W.** V1.vigencia_fim alinhada ao início de V2.
- **X.** Sem lacuna de vigência na sucessão.
- **Y.** Leader/admin enxergam drafts.
- **Z.** Equipe não enxerga drafts/suspended/archived.
