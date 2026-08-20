# PLANO DE SANEAMENTO AUTOSSUFICIENTE — FASE 1A (CORREÇÃO CIRÚRGICA PÓS-AUDITORIA)

NÃO iniciar Fase 1B. NÃO iniciar Fase 2. A execução anterior foi REPROVADA. NÃO editar migrations já aplicadas. Criar EXATAMENTE UMA NOVA migration corretiva de saneamento.

## 1. UMA ÚNICA MIGRATION CORRETIVA
Criar exatamente UMA NOVA migration de saneamento. NÃO editar migrations já aplicadas. NÃO criar migrations de teste intermediárias, temporárias ou para testar SET ROLE. A migration deve ser transacional. Se qualquer requisito bloqueante falhar, a migration inteira deve ser ABORTADA via RAISE. Após a migration, executar somente consultas READ-ONLY de verificação.

## 2. VIABILIDADE DO OWNER — BLOQUEANTE
Antes de consolidar a arquitetura, garantir que o estado final seja:
`public.publish_procedure_version(uuid, date, uuid)` SECURITY DEFINER OWNER = `internal_proc_executor`.
SEM: SET ROLE, RESET ROLE, GUC, service_role como executor ou owner postgres como alternativa. O ESTADO FINAL não pode depender de membership permanente. Se não for possível atingir esse estado final, ABORTAR TODA A MIGRATION, PARAR E REPORTAR. NÃO improvisar.

## 3. ROLE — PRESERVAR CONFIGURAÇÃO
`internal_proc_executor` deve permanecer: NOLOGIN, NOINHERIT, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOREPLICATION, BYPASSRLS.
Privilégios mínimos finais:
- SELECT, UPDATE ON `public.procedimento_versoes`
- SELECT ON `public.procedimentos`
- UPDATE(id) ON `public.procedimentos` (exclusivamente para SELECT FOR UPDATE)
- USAGE ON SCHEMA `public`
- EXECUTE somente nas funções indispensáveis, incluindo `public.has_role(uuid, public.app_role)`.
NÃO conceder UPDATE amplo em `public.procedimentos`. NÃO conceder privilégios em tabelas operacionais.

## 4. MEMBERSHIP — ESTADO FINAL
Remover qualquer membership desnecessário em `internal_proc_executor`. Estado final SEM membership para: anon, authenticated, authenticator, service_role, leader, admin. Remover o membership `postgres -> internal_proc_executor` após configuração do ownership, desde que não impeça o funcionamento da RPC. A RPC não pode depender de membership.

## 5. RPC LEGADA
DROP FUNCTION: `public.publish_procedure_version(uuid)`. No final deve existir EXATAMENTE UMA assinatura: `public.publish_procedure_version(uuid, date, uuid)`. Remover `private.internal_close_superseded_version` se confirmado uso exclusivo legado. Nenhuma função ativa de publicação pode conter: app.internal_mutation, set_config, current_setting, SET ROLE, RESET ROLE, INTERVAL '1 day', qualquer GUC ou flag de sessão.

## 6. RPC CANÔNICA
`public.publish_procedure_version(p_versao_id uuid, p_vigencia_inicio date, p_substitui_versao_id uuid DEFAULT NULL)`
- SECURITY DEFINER, OWNER: `internal_proc_executor`, search_path seguro.
- Permissões: PUBLIC/anon sem EXECUTE; authenticated com EXECUTE.
- Internamente exigir: auth.uid() IS NOT NULL e (leader OU admin). Caso contrário, RAISE EXCEPTION.
- NÃO usar SET ROLE no corpo.

## 7. LOCK E ATOMICIDADE — 14 PASSOS
A RPC deve executar exatamente nesta sequência:
1. Validar auth.uid();
2. Validar leader/admin;
3. Localizar procedimento_id da versão alvo;
4. Executar SELECT ... FOR UPDATE em `public.procedimentos`;
5. Somente depois do lock reler a versão alvo;
6. Confirmar novamente status = draft;
7. Carregar vigencia_inicio e substitui_versao_id do draft;
8. Reler predecessor se houver;
9. Confirmar mesmo procedimento_id;
10. Validar status/data da predecessor;
11. Validar árvore;
12. Fechar predecessor;
13. Publicar sucessora;
14. Concluir tudo atomicamente na mesma transação.
Concorrência serializada pelo procedimento lógico.

## 8. TRIGGER LEGADO
DROP TRIGGER `trigger_immutability_final` ON `public.procedimento_versoes`. Remover `public.trg_enforce_versao_immutability()` se sem outras dependências. Não deixar current_setting/GUC ativo.

## 9. TRIGGER CANÔNICO
Manter exatamente UM trigger para UPDATE: `trg_procedimento_versao_integrity`.
Função `public.check_procedimento_versao_integrity()` deve ser SECURITY INVOKER/default (NÃO SECURITY DEFINER). Durante RPC, current_user = `internal_proc_executor`. Na API normal, current_user != `internal_proc_executor`.

## 10. WHITELIST EXATA — CASO A
Quando current_user = `internal_proc_executor` e OLD.status = draft -> NEW.status = published:
SOMENTE podem mudar: status, published_at, publicado_por_id, status_updated_at, status_alterado_por_id.
Todos os outros campos devem permanecer IDÊNTICOS (whitelist real). Comparar: id, procedimento_id, versao, titulo, categoria, descricao, setor, fonte, arvore_decisao, vigencia_inicio, vigencia_fim, substitui_versao_id, criado_por_id, created_at.

## 11. PUBLICAÇÃO NÃO ALTERA VIGÊNCIA
A RPC NÃO deve executar `SET vigencia_inicio = p_vigencia_inicio`. O valor já deve estar no draft. Validar que draft.vigencia_inicio = p_vigencia_inicio. Se divergir, REJEITAR.

## 12. WHITELIST EXATA — CASO B
Quando current_user = `internal_proc_executor` e OLD.status = published -> NEW.status = published:
ÚNICO campo alterável: vigencia_fim. Todos os outros devem permanecer idênticos, incluindo auditoria (status_updated_at, etc), published_at, conteúdo, versao, etc.

## 13. TRILHA NORMAL
Quando current_user != `internal_proc_executor`:
Permitir SOMENTE: published -> suspended, published -> archived, suspended -> archived.
Mudar apenas: status, status_updated_at, status_alterado_por_id (preenchidos pelo backend).
Bloquear explicitamente: draft -> published, published -> published, qualquer mudança de conteúdo/vigência.

## 14. SUCESSÃO
Fonte canônica: `procedimento_versoes.substitui_versao_id` no draft.
Após o lock:
1. Reler predecessor;
2. Confirmar mesmo procedimento_id;
3. Confirmar predecessor status = published;
4. Confirmar que successor.vigencia_inicio é válido;
5. Fechar predecessor exatamente com V1.vigencia_fim = V2.vigencia_inicio.
NÃO usar now(), INTERVAL '1 day' ou subtração de data. Se p_substitui_versao_id divergir do draft, REJEITAR.

## 15. RLS — REMOVER NOMINALMENTE AS LEGADAS
Remover explicitamente: "Líderes e Admins podem ler todos", "Líderes e admins podem deletar rascunhos", "Líderes e admins podem editar rascunhos", "Líderes podem alterar status de publicados", "Líderes podem editar rascunhos", "Líderes podem inserir rascunhos".

## 16. RLS CANÔNICA — EXPRESSÕES EXATAS
1. "Equipes veem publicados ativos": status = 'published' AND vigencia_inicio <= CURRENT_DATE AND (vigencia_fim IS NULL OR vigencia_fim > CURRENT_DATE).
2. "Líderes e admins veem tudo": public.has_role(auth.uid(), 'leader'/'admin').
3. "Líderes e admins inserem drafts": leader/admin AND status = 'draft'.
4. "Líderes e admins editam drafts": leader/admin AND OLD.status = draft AND NEW.status = draft. (draft -> published impossível via API).
5. "Líderes e admins atualizam status histórico": leader/admin AND status IN ('published','suspended') -> status IN ('published','suspended','archived'). (Trigger garante matriz).
6. "Líderes e admins deletam drafts": leader/admin AND status = 'draft'.
NÃO alterar RLS de tabelas operacionais.

## 17. JSONB — VALIDAÇÃO COMPLETA
Validar: arvore_decisao is object; nodes is array not empty; todo node tem ID; IDs únicos (COUNT nodes = COUNT DISTINCT node.id); startNodeId existe; existe pelo menos um node result; todo result tem instruction; toda question tem answers array not empty; toda answer tem nextNodeId existente.

## 18. OVERLAP DATE
`check_vigencia_overlap` deve usar apenas DATE. Semântica [início, fim). V1.vigencia_fim = V2.vigencia_inicio NÃO é overlap. Sem TIMESTAMPTZ, now() ou INTERVAL '1 day'.

## 19. DELETE HISTÓRICO
Manter exatamente UM trigger `trg_procedimento_versao_delete_historical`. draft: segue para RLS; published/suspended/archived: RAISE EXCEPTION.

## 20. PERMISSÕES DE FUNÇÕES
- RPC canônica: authenticated EXECUTE; PUBLIC/anon sem EXECUTE.
- Helpers imutabilidade: sem EXECUTE para PUBLIC/anon.
- `create_procedure_with_version`: authenticated leader/admin; cria SOMENTE draft.

## 21. FRONTEND — SUCESSÃO
Em `src/routes/_authenticated/leader-procedures.tsx`: usar `substitui_versao_id` real do draft. Backend é fonte canônica.

## 22. FRONTEND — DATE
`ProcedureForm` mantido. Na listagem: NÃO usar `new Date()` para DATE. Formatar YYYY-MM-DD calendar-safe (ex: 2026-09-15 -> 15/09/2026) sem timezone.

## 23. TYPES
`src/integrations/supabase/types.ts` deve refletir SOMENTE a assinatura real canônica (3 parâmetros). Sem overload Legado.

## 24. ZONA PROTEGIDA
PROIBIDO ALTERAR: `src/lib/sync/**`, `src/lib/offline-auth.ts`, `src/lib/sync/session-backup.ts`, `src/lib/db/local-db.ts`, `src/lib/db/repos.ts`, `src/lib/db/catalogs.ts`, `src/components/layout/SyncIndicator.tsx`, `NetworkService`, stores de conectividade, diagnósticos, alertas online/offline, autenticação existente, outbox, `capacitor.config.ts`, `mobile/**`, `android/**`, Home da equipe, fluxo iniciar/continuar expediente, serviços existentes, tabelas operacionais, RLS das tabelas operacionais.

## 25. TESTES INDIVIDUALIZADOS
A. draft -> published direto rejeitado pela RLS.
B. RPC publica draft corretamente.
C. published -> suspended funciona via API.
D. published -> archived funciona via API.
E. suspended -> archived funciona via API.
F. status + conteúdo operacional simultâneo rejeitado no UPDATE.
G. published.vigencia_fim direto via API é rejeitado.
H. Tentativa de manipular GUC não concede bypass.
I. Nenhuma autorização depende de GUC.
J. startNodeId inválido rejeitado no backend.
K. result sem instruction rejeitado no backend.
L. answer sem nextNodeId rejeitada no backend.
M. nextNodeId inexistente rejeitado no backend.
N. Concorrência serializada pelo lock no procedimento.
O. DELETE de published bloqueado pelo trigger.
P. DELETE de suspended bloqueado pelo trigger.
Q. DELETE de archived bloqueado pelo trigger.
R. PUBLIC sem EXECUTE da RPC.
S. anon sem EXECUTE da RPC.
T. authenticated só publica se leader/admin.
U. Zona protegida intacta.
V. Vigência futura não fecha V1 em now().
W. Fim V1 = início V2.
X. Nenhuma lacuna de vigência na sucessão.
Y. Leader/admin veem drafts.
Z. Equipe não vê drafts/suspended/archived.
AA. authenticated sem membership em internal_proc_executor.
AB. anon sem membership em internal_proc_executor.
AC. authenticator sem membership/SET ROLE para internal_proc_executor.
AD. service_role sem membership/SET ROLE para internal_proc_executor.
AE. Chamada API normal não apresenta current_user = internal_proc_executor.
AF. publish_procedure_version executa como identidade interna dedicada.
AG. Identidade interna não consegue modificar conteúdo fora dos padrões autorizados (Trilha A/B).
AH. Existe exatamente um trigger de DELETE histórico.
AI. Leader/admin conseguem deletar draft.
AJ. Deleção física de published/suspended/archived rejeitada pelo trigger.
AK. internal_proc_executor possui BYPASSRLS (se suportado).
AL. internal_proc_executor possui somente privilégios mínimos em procedimentos.
AM. internal_proc_executor não possui privilégios sobre tabelas operacionais.
AN. RPC SECURITY DEFINER faz draft -> published apesar da RLS.
AO. BYPASSRLS não permite violar imutabilidade do trigger.
AP. published -> suspended continua funcionando com novo trigger.
AQ. published -> archived continua funcionando.
AR. suspended -> archived continua funcionando.
AS. Nessas três transições, somente status/auditoria podem mudar.
AT. vigencia_inicio e vigencia_fim são DATE.
AU. 2026-09-15 nunca vira 2026-09-14 por timezone.
AV. V1 ativa durante 2026-09-14.
AW. V1 inativa em 2026-09-15.
AX. V2 ativa em 2026-09-15.
AY. Sucessão não cria lacuna entre V1 e V2.
AZ. Frontend não usa conversão UTC para campos DATE de Procedimentos.
BA. Durante sucessão V1 published -> V1 published com fechamento de vigencia_fim, somente vigencia_fim é alterado; status_updated_at e status_alterado_por_id permanecem exatamente iguais.
BB. internal_proc_executor possui SELECT em public.procedimentos.
BC. internal_proc_executor possui UPDATE somente na coluna mínima necessária de public.procedimentos para permitir SELECT FOR UPDATE.
BD. internal_proc_executor não possui UPDATE amplo em public.procedimentos.
BE. publish_procedure_version consegue obter o lock SELECT ... FOR UPDATE em public.procedimentos sem erro de permissão.
BF. publish_procedure_version nunca executa UPDATE em public.procedimentos.
BG. Nenhum valor de public.procedimentos é modificado durante publicação ou sucessão.
BH. existe exatamente UMA assinatura de publish_procedure_version.
BI. não existe publish_procedure_version(uuid) legada.
BJ. nenhuma função ativa contém app.internal_mutation.
BK. nenhuma função ativa contém set_config relacionado à publicação.
BL. nenhuma função ativa contém current_setting relacionado ao bypass.
BM. RPC canônica não contém SET ROLE nem RESET ROLE.
BN. RPC canônica OWNER = internal_proc_executor.
BO. trigger de imutabilidade é SECURITY INVOKER/default.
BP. trigger enxerga current_user = internal_proc_executor durante RPC.
BQ. trigger não enxerga internal_proc_executor em UPDATE normal da API.
BR. existe exatamente UM trigger de imutabilidade canônico.
BS. policy "Líderes podem editar rascunhos" não existe.
BT. nenhuma policy permite draft -> published direto.
BU. IDs duplicados de nodes são rejeitados.
BV. publicação não modifica vigencia_inicio.
BW. sucessão usa substitui_versao_id persistido no draft.
BX. predecessor fecha exatamente em successor.vigencia_inicio.
BY. frontend nunca exibe DATE com deslocamento de timezone.
BZ. internal_proc_executor não possui membership de anon/authenticated/authenticator/service_role/leader/admin.
CA. estado final não depende de membership permanente de postgres para funcionamento da RPC.
CB. types não possuem assinatura RPC obsoleta.
CC. nenhum arquivo da zona protegida foi alterado.

## 26. PARADA OBRIGATÓRIA
Se não for possível obter OWNER = internal_proc_executor com RPC SECURITY DEFINER, sem SET ROLE, sem GUC, sem owner postgres como fallback e sem membership permanente necessário para a API: ABORTAR, REPORTAR, NÃO EXECUTAR E NÃO IMPROVISAR.
