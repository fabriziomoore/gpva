# PLANO DE SANEAMENTO AUTOSSUFICIENTE — FASE 1A (CORREÇÃO CIRÚRGICA PÓS-AUDITORIA)

NÃO iniciar Fase 1B. NÃO iniciar Fase 2. A execução anterior foi REPROVADA. NÃO editar migrations já aplicadas. Criar EXATAMENTE UMA NOVA migration corretiva de saneamento.

## 1. UMA ÚNICA MIGRATION CORRETIVA
Criar na futura execução exatamente UMA NOVA migration de saneamento. NÃO editar migrations já aplicadas. NÃO criar migrations de teste intermediárias. NÃO criar migration apenas para testar SET ROLE. NÃO criar migration temporária. A migration deve ser transacional. Se qualquer requisito bloqueante falhar: RAISE/ABORTAR a migration inteira. Depois dela: somente consultas READ-ONLY de verificação.

## 2. VIABILIDADE DO OWNER — BLOQUEANTE
Antes de consolidar a arquitetura, garantir que o estado final possa ser: `public.publish_procedure_version(uuid,date,uuid)` SECURITY DEFINER OWNER = `internal_proc_executor` SEM: SET ROLE, RESET ROLE, GUC, service_role como executor, owner postgres como alternativa. Pode existir mecanismo estritamente necessário durante a própria migration para configurar ownership, mas o ESTADO FINAL não pode depender de membership permanente. Se não for possível atingir esse estado final: ABORTAR TODA A MIGRATION, PARAR, REPORTAR. NÃO improvisar.

## 3. ROLE — PRESERVAR CONFIGURAÇÃO
`internal_proc_executor` deve permanecer: NOLOGIN, NOINHERIT, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOREPLICATION, BYPASSRLS. Privilégios mínimos finais: SELECT, UPDATE ON `public.procedimento_versoes`; SELECT ON `public.procedimentos`; UPDATE(id) ON `public.procedimentos`; USAGE ON SCHEMA `public`; EXECUTE somente nas funções indispensáveis, incluindo `public.has_role(uuid, public.app_role)`. NÃO conceder UPDATE amplo em `public.procedimentos`. NÃO conceder privilégios em tabelas operacionais.

## 4. MEMBERSHIP — ESTADO FINAL
Remover qualquer membership desnecessário em `internal_proc_executor`. Confirmar explicitamente estado final SEM membership para: anon, authenticated, authenticator, service_role, leader, admin. Remover também o membership atualmente existente: `postgres -> internal_proc_executor` depois que o ownership estiver corretamente configurado, desde que isso não impeça o funcionamento normal da RPC. O funcionamento da RPC não pode depender desse membership.

## 5. RPC LEGADA
Após verificar dependências: DROP FUNCTION: `public.publish_procedure_version(uuid)`. No final deve existir EXATAMENTE UMA assinatura: `public.publish_procedure_version(uuid,date,uuid)`. Remover também: `private.internal_close_superseded_version` SOMENTE se confirmado que ela é usada exclusivamente pelo fluxo legado e não possui outra dependência legítima. Nenhuma função ativa relacionada à publicação pode conter: app.internal_mutation, set_config(...), current_setting(...), SET ROLE, RESET ROLE, INTERVAL '1 day', qualquer GUC, qualquer flag de sessão equivalente.

## 6. RPC CANÔNICA
`public.publish_procedure_version(p_versao_id uuid, p_vigencia_inicio date, p_substitui_versao_id uuid DEFAULT NULL)` deve ser: SECURITY DEFINER, OWNER: `internal_proc_executor`, search_path seguro. Permissões: PUBLIC: SEM EXECUTE; anon: SEM EXECUTE; authenticated: EXECUTE. Dentro da RPC exigir: auth.uid() IS NOT NULL e: `public.has_role(auth.uid(), 'leader')` OU `public.has_role(auth.uid(), 'admin')`. Caso contrário: RAISE EXCEPTION. Não usar SET ROLE no corpo.

## 7. LOCK E ATOMICIDADE — 14 PASSOS
A RPC deve executar nesta sequência:
1. validar auth.uid();
2. validar leader/admin;
3. localizar procedimento_id da versão alvo;
4. executar SELECT ... FOR UPDATE em public.procedimentos;
5. somente depois do lock reler a versão alvo;
6. confirmar novamente status = draft;
7. carregar também vigencia_inicio e substitui_versao_id do draft;
8. reler predecessor se houver;
9. confirmar mesmo procedimento_id;
10. validar status/data da predecessor;
11. validar árvore;
12. fechar predecessor;
13. publicar sucessora;
14. concluir tudo atomicamente na mesma transação.
Concorrência deve permanecer serializada pelo procedimento lógico.

## 8. TRIGGER LEGADO
DROP TRIGGER: `trigger_immutability_final` ON `public.procedimento_versoes`. Remover: `public.trg_enforce_versao_immutability()` se não possuir outra dependência. Não deixar current_setting/GUC ativo.

## 9. TRIGGER CANÔNICO
Manter exatamente UM trigger responsável pela matriz de UPDATE: `trg_procedimento_versao_integrity`. Função: `public.check_procedimento_versao_integrity()` deve ser: SECURITY INVOKER/default (NÃO SECURITY DEFINER). Durante RPC SECURITY DEFINER: current_user = `internal_proc_executor`. Durante UPDATE normal da API: current_user != `internal_proc_executor`.

## 10. WHITELIST EXATA — CASO A
Quando: current_user = `internal_proc_executor`, OLD.status = draft, NEW.status = published. SOMENTE podem mudar: status, published_at, publicado_por_id, status_updated_at, status_alterado_por_id. TODOS os demais campos devem permanecer idênticos. Comparar explicitamente TODOS os campos existentes da tabela que não estão na whitelist. No mínimo: id, procedimento_id, versao, titulo, categoria, descricao, setor, fonte, arvore_decisao, vigencia_inicio, vigencia_fim, substitui_versao_id, criado_por_id, created_at e qualquer outro campo real existente. Não usar blacklist parcial.

## 11. PUBLICAÇÃO NÃO ALTERA VIGÊNCIA
A RPC NÃO deve executar: `SET vigencia_inicio = p_vigencia_inicio`. O valor já existe no draft. Após reler o draft: validar que: `draft.vigencia_inicio = p_vigencia_inicio`. Se divergir: REJEITAR. Depois publicar alterando apenas os campos permitidos no Caso A.

## 12. WHITELIST EXATA — CASO B
Quando: current_user = `internal_proc_executor`, OLD.status = published, NEW.status = published. ÚNICO campo alterável: vigencia_fim. TODOS os outros devem permanecer idênticos. Incluir explicitamente: status, status_updated_at, status_alterado_por_id, published_at, publicado_por_id, vigencia_inicio, titulo, descricao, fonte, categoria, setor, arvore_decisao, versao, substitui_versao_id, procedimento_id, criado_por_id, created_at e demais campos reais.

## 13. TRILHA NORMAL
Quando: current_user != `internal_proc_executor`. Permitir SOMENTE: published -> suspended, published -> archived, suspended -> archived. SOMENTE podem mudar: status, status_updated_at, status_alterado_por_id. Backend preenche: status_updated_at = now(), status_alterado_por_id = auth.uid(). Bloquear explicitamente: published -> published, published -> draft, suspended -> suspended, suspended -> published, suspended -> draft, archived -> qualquer estado, draft -> published, draft -> suspended, draft -> archived. Bloquear qualquer mudança simultânea de conteúdo/vigência.

## 14. SUCESSÃO
A fonte canônica da relação é: `procedimento_versoes.substitui_versao_id` persistida no próprio draft. Após o lock, carregar: draft.substitui_versao_id, draft.vigencia_inicio. Se substitui_versao_id não for NULL: 1. reler predecessor; 2. confirmar mesmo procedimento_id; 3. confirmar predecessor status = published; 4. confirmar que successor.vigencia_inicio é temporalmente válido; 5. fechar predecessor exatamente com: V1.vigencia_fim = V2.vigencia_inicio; 6. publicar sucessora. Não usar: now(), INTERVAL '1 day', subtração de data. Se p_substitui_versao_id permanecer como parâmetro: comparar com draft.substitui_versao_id. Valores diferentes: REJEITAR. Para draft sem predecessor: ambos devem ser NULL/compatíveis.

## 15. RLS — REMOVER NOMINALMENTE AS LEGADAS
Auditar todas as policies atuais de: `public.procedimento_versoes`. Remover explicitamente as legadas encontradas: "Líderes e Admins podem ler todos", "Líderes e admins podem deletar rascunhos", "Líderes e admins podem editar rascunhos", "Líderes podem alterar status de publicados", "Líderes podem editar rascunhos", "Líderes podem inserir rascunhos" e qualquer outra policy duplicada da mesma responsabilidade. No final devem existir SOMENTE as 6 policies canônicas abaixo.

## 16. RLS CANÔNICA — EXPRESSÕES EXATAS
1. "Equipes veem publicados ativos": FOR SELECT TO authenticated USING: status = 'published' AND vigencia_inicio <= CURRENT_DATE AND (vigencia_fim IS NULL OR vigencia_fim > CURRENT_DATE).
2. "Líderes e admins veem tudo": FOR SELECT TO authenticated USING: public.has_role(auth.uid(), 'leader') OR public.has_role(auth.uid(), 'admin').
3. "Líderes e admins inserem drafts": FOR INSERT TO authenticated WITH CHECK: (public.has_role(auth.uid(), 'leader') OR public.has_role(auth.uid(), 'admin')) AND status = 'draft'.
4. "Líderes e admins editam drafts": FOR UPDATE TO authenticated USING: leader/admin AND OLD status lógico = draft WITH CHECK: leader/admin AND NEW status lógico = draft. Portanto: draft -> published direto é impossível.
5. "Líderes e admins atualizam status histórico": FOR UPDATE TO authenticated USING: leader/admin AND status IN ('published','suspended') WITH CHECK: leader/admin AND status IN ('published','suspended','archived'). O trigger é responsável pela matriz exata.
6. "Líderes e admins deletam drafts": FOR DELETE TO authenticated USING: leader/admin AND status = 'draft'. No final: EXATAMENTE essas seis policies. Não alterar RLS de nenhuma tabela operacional.

## 17. JSONB — VALIDAÇÃO COMPLETA
Antes da publicação validar: jsonb_typeof(arvore_decisao) = 'object'; nodes existe; jsonb_typeof(nodes) = 'array'; nodes não vazio; todo node possui id não vazio; IDs dos nodes são únicos: COUNT(nodes) = COUNT(DISTINCT node.id); startNodeId não vazio; startNodeId corresponde a node existente; existe pelo menos um node type=result; todo result possui instruction não vazia; toda question possui answers; answers é array; answers não vazio; toda answer possui nextNodeId não vazio; todo nextNodeId corresponde a node existente. Não reduzir isso a "integridade estrutural".

## 18. OVERLAP DATE
Confirmar/ajustar: `public.check_vigencia_overlap()` para trabalhar somente com DATE. Semântica obrigatória: [vigencia_inicio, vigencia_fim) vigencia_fim exclusivo. vigencia_fim NULL: intervalo aberto. Dois intervalos em que: V1.vigencia_fim = V2.vigencia_inicio NÃO são overlap. Não usar TIMESTAMPTZ. Não usar now(). Não usar INTERVAL '1 day'.

## 19. DELETE HISTÓRICO
Manter exatamente UM: `trg_procedimento_versao_delete_historical` BEFORE DELETE ON public.procedimento_versoes. draft: RETURN OLD / seguir para RLS; published: RAISE EXCEPTION; suspended: RAISE EXCEPTION; archived: RAISE EXCEPTION. Não criar segundo trigger com mesma responsabilidade.

## 20. PERMISSÕES DE FUNÇÕES
publish_procedure_version canônica: PUBLIC sem EXECUTE; anon sem EXECUTE; authenticated com EXECUTE. check_procedimento_versao_integrity: não deve ficar exposta desnecessariamente para PUBLIC/anon. prevent_procedimento_versao_historical_delete: não deve ficar exposta desnecessariamente para PUBLIC/anon. create_procedure_with_version: pode continuar authenticated, mas deve: exigir auth.uid(), exigir leader/admin, criar SOMENTE draft.

## 21. FRONTEND — SUCESSÃO
Alterar somente o necessário em: `src/routes/_authenticated/leader-procedures.tsx`. Para nova versão: garantir que a relação de sucessão persistida seja respeitada. Se enviar: p_substitui_versao_id, usar o ID real: editing/new draft.substitui_versao_id e nunca um valor inventado. Backend continua sendo fonte canônica.

## 22. FRONTEND — DATE
ProcedureForm já foi corrigido e deve permanecer assim. Na listagem: NÃO usar: `new Date(proc.vigencia_inicio)`, `new Date(proc.vigencia_fim)` para PostgreSQL DATE. Formatar YYYY-MM-DD de maneira calendar-safe. Exemplo obrigatório: 2026-09-15 -> 15/09/2026 sem depender de UTC/timezone.

## 23. TYPES
Após remover a RPC legada: `src/integrations/supabase/types.ts` deve possuir SOMENTE a assinatura real canônica de: publish_procedure_version. Não manter overload: Args: { p_versao_id: string } da assinatura uuid antiga. Modificar somente o trecho necessário.

## 24. ZONA PROTEGIDA
PROIBIDO ALTERAR: `src/lib/sync/**`, `src/lib/offline-auth.ts`, `src/lib/sync/session-backup.ts`, `src/lib/db/local-db.ts`, `src/lib/db/repos.ts`, `src/lib/db/catalogs.ts`, `src/components/layout/SyncIndicator.tsx`, NetworkService, stores de conectividade, diagnósticos, alertas online/offline, autenticação existente, outbox, capacitor.config.ts, mobile/**, android/**, Home da equipe, fluxo iniciar/continuar expediente, serviços existentes, tabelas operacionais, RLS das tabelas operacionais. Não iniciar Fase 1B. Não iniciar Fase 2. Não implementar cache offline. Não implementar IA.

## 25. TESTES
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
Se não for possível obter: OWNER = internal_proc_executor com RPC SECURITY DEFINER, sem SET ROLE dentro da função, sem GUC, sem owner postgres como fallback, e sem membership permanente necessário para funcionamento da API: ABORTAR. REPORTAR. NÃO EXECUTAR correções parciais. NÃO IMPROVISAR. Apresente novamente o .lovable/plan.md completo. NÃO EXECUTE.
