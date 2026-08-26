# A5 — ADMIN DA ESTRUTURA OPERACIONAL (PLANO v2 CORRIGIDO — NÃO EXECUTADO)

Auditoria real de `src/routes/admin.tsx`, `src/lib/admin.functions.ts`, `src/lib/admin.functions.mobile.ts`, `supabase/functions/admin-api/index.ts` e dos triggers do banco. Nenhum arquivo funcional foi modificado.

## 0. Achados da auditoria

Frontend/backend:
- `SECTION_GROUPS.estrutura` = `["setores", "create_team", "leaders"]` — não existe seção Supervisores.
- `SetoresSection`/`SetorEditRow` pedem "Nome do supervisor" como texto livre.
- `CreateTeamSection` usa `setorId` (UUID) + `leaderName` (string). Sem supervisor.
- `TeamHeader` edita líder textual; `TeamRow` não tem `supervisor_id`/`leader_id`.
- `adminCreateLeader` cria `auth.users` + `user_roles(leader)`; **não** cria `lideres_estrutura`.
- `adminDeleteLeader` chama `auth.admin.deleteUser` direto, sem verificação de vínculos.
- Não existe CRUD de `public.supervisores` (nem web, nem `admin-api`).
- `adminDeleteSetor` bloqueia só por equipes.
- `types.ts` já cobre `supervisores`, `lideres_estrutura`, `equipes.supervisor_id/leader_id`; `PostgrestVersion: "14.5"`. **Sem divergência → sem regeneração.**

### 0.1 AUDITORIA DE ESPELHAMENTO UUID → TEXTO (correção item 1)

Triggers reais existentes hoje (`pg_trigger`, não-internos):

| Trigger | Tabela | Evento | Função | Comportamento |
|---|---|---|---|---|
| `check_equipe_hierarquia` | `public.equipes` | BEFORE INSERT OR UPDATE OF `setor_id, supervisor_id, leader_id, supervisor, leader` | `check_equipe_hierarquia_integrity()` | **Somente validação.** Bloqueia equipe não-admin de alterar IDs estruturais e de alterar textos quando os IDs estão preenchidos; proíbe líder sem supervisor; valida supervisor→setor, líder→setor, líder→supervisor. **Nenhuma atribuição a `NEW.supervisor` ou `NEW.leader`.** |
| `check_integrity` | `public.lideres_estrutura` | BEFORE INSERT/UPDATE OF `setor_id, supervisor_id` | `check_lider_estrutura_integrity()` | Validação estrutural apenas |
| `set_updated_at` | `supervisores`, `lideres_estrutura` | BEFORE UPDATE | `touch_operacional_estrutura_updated_at()` | Só timestamp |
| `trg_setores_updated_at` | `setores` | BEFORE UPDATE | `touch_catalog_order_updated_at()` | Só timestamp |

**Conclusão comprovada:** não existe nenhum trigger, função ou rotina que espelhe `supervisor_id → equipes.supervisor` ou `leader_id → equipes.leader`. A A4.1/A4.1B removeu essas atribuições e nada as substituiu.

**Consequências obrigatórias para a A5:**
- A afirmação do plano v1 de que "os triggers cuidam do espelhamento" está **removida**.
- A A5 **não** cria, altera ou restaura espelhamento.
- A A5 **não** executa nenhum UPDATE em massa de `equipes.supervisor` / `equipes.leader` por renomeação de Supervisor ou Líder — isso destruiria as strings históricas restauradas pela A4.2.
- Todas as ressincronizações textuais previstas no plano v1 (itens 5, 8 e 9 antigos) estão **eliminadas**.
- Os textos legados ficam congelados como histórico; os UUIDs são a única fonte de verdade.
- Se no futuro for desejada uma política de espelhamento, isso vira **microetapa própria (A5.x/A7)**, fora da A5.
- Efeito colateral aceito e documentado: renomear Supervisor/Líder faz o texto legado da equipe divergir do nome canônico. A UI exibirá o nome canônico via UUID; o texto legado só aparece como campo histórico/diagnóstico rotulado.

## 1. Funções alteradas em `src/lib/admin.functions.ts`

| Função | Alteração |
|---|---|
| `adminCreateSetor` | assinatura passa a ser `{ adminPassword, nome }`; backend persiste `supervisor_nome: ''` apenas por compatibilidade de coluna |
| `adminUpdateSetor` | deixa de aceitar `supervisorNome` |
| `adminDeleteSetor` | acrescenta bloqueio por supervisores vinculados (antes do bloqueio por equipes) |
| `adminCreateLeader` | exige `setorId` + `supervisorId`; cria `lideres_estrutura`; compensação |
| `adminListLeaders` | retorna estrutura normalizada + flag `estrutura_normalizada` |
| `adminDeleteLeader` | bloqueio por equipes + snapshot/compensação (item 8) |
| `adminCreateTeam` | `leaderName` → `supervisorId` + `leaderId`; validação; UPDATE único; compensação |
| `adminUpdateTeam` | `leaderName` → `supervisorId` + `leaderId`; validação; UPDATE único |
| `listTeams` | select inclui `supervisor_id`, `leader_id`, `supervisor` |

## 2. Novas funções (lista oficial completa — correção item 5)

1. `adminListSupervisores`
2. `adminCreateSupervisor`
3. `adminUpdateSupervisor`
4. `adminDeleteSupervisor`
5. `adminUpdateLeader` — renomear e/ou reestruturar líder já normalizado
6. `adminNormalizeLeader` — **função dedicada** para completar líder legado (`user_roles.leader` sem `lideres_estrutura`); mantida separada de `adminUpdateLeader` porque a semântica é INSERT, não UPDATE, e o nome precisa de confirmação explícita do administrador
7. Helper interno privado `assertHierarchy(supabaseAdmin, { setorId, supervisorId?, leaderId? })` (não exportado como server fn)

## 3. Assinaturas antes/depois

```text
adminCreateSetor
  antes:  { adminPassword, nome, supervisorNome }
  depois: { adminPassword, nome }
          // supervisor_nome = '' gravado apenas por compatibilidade de coluna;
          // não é campo de UI e não representa relacionamento

adminUpdateSetor
  antes:  { adminPassword, setorId, nome?, supervisorNome? }
  depois: { adminPassword, setorId, nome? }

adminListSupervisores { adminPassword }
  -> { id, nome, setor_id, setor_nome, user_id }[]
adminCreateSupervisor { adminPassword, nome, setorId } -> { ok }
adminUpdateSupervisor { adminPassword, supervisorId, nome?, setorId? } -> { ok }
adminDeleteSupervisor { adminPassword, supervisorId } -> { ok }

adminCreateLeader
  antes:  { adminPassword, leaderName, login, password }
  depois: { adminPassword, leaderName, login, password, setorId, supervisorId }

adminListLeaders
  antes:  -> { id, email, login, display_name }[]
  depois: -> { user_id, leader_structure_id | null, nome, login, email,
               setor_id | null, setor_nome | null,
               supervisor_id | null, supervisor_nome | null,
               estrutura_normalizada: boolean }[]

adminUpdateLeader (NOVA)
  { adminPassword, leaderStructureId, nome?, setorId?, supervisorId? }

adminNormalizeLeader (NOVA)
  { adminPassword, leaderUserId, nome, setorId, supervisorId } -> { ok }

adminDeleteLeader
  antes:  { adminPassword, leaderId }
  depois: { adminPassword, leaderUserId }

adminCreateTeam
  antes:  { adminPassword, teamName, password, setorId, leaderName }
  depois: { adminPassword, teamName, password, setorId, supervisorId, leaderId }

adminUpdateTeam
  antes:  { ..., setorId?, leaderName? }
  depois: { ..., setorId?, supervisorId?, leaderId? }   // trio exigido em conjunto
```

## 4. Criação de Supervisor

Nome + Setor (select por `setores.id`). Server-side: setor existe → INSERT `supervisores { nome, setor_id }`, `user_id` NULL. Nenhuma conta de login (A6).

## 5. Edição / exclusão de Supervisor (sem ressincronização textual)

Edição:
- Só `nome`: permitido sempre. UPDATE apenas em `supervisores.nome`. **Nenhum UPDATE em `equipes.supervisor`** (ver 0.1).
- `setorId` diferente: se existir líder (`lideres_estrutura.supervisor_id`) ou equipe (`equipes.supervisor_id`) vinculada → erro `"Supervisor possui líderes/equipes vinculados. Mova-os antes de alterar o setor."` Sem vínculos: permitido.

Exclusão: bloquear por líderes vinculados; bloquear por equipes vinculadas (mensagens distintas); só então DELETE. Sem CASCADE.

## 6. Criação de Líder

Campos: Nome, Login, Senha, Setor, Supervisor (encadeado). Server-side, em ordem:
1. `assertAdmin`, senha ≥ 6, login sanitizado;
2. `assertHierarchy({ setorId, supervisorId })`;
3. `auth.admin.createUser`;
4. `user_roles.upsert(role='leader')`;
5. `INSERT lideres_estrutura { user_id, nome, setor_id, supervisor_id }`.

## 7. Compensação em criação parcial (auth + estrutura)

Passos 4 e 5 dentro de `try`. Em erro:
- `DELETE lideres_estrutura WHERE user_id = novo` (best-effort);
- `DELETE user_roles WHERE user_id = novo AND role='leader'` (best-effort);
- `auth.admin.deleteUser(novo)`;
- rethrow com mensagem original + `"(conta revertida)"`; se a compensação falhar, erro CRÍTICO com o UUID para intervenção manual.

Mesmo padrão em `adminCreateTeam` (falha no UPDATE estrutural → `deleteUser`).

## 8. Edição / exclusão de Líder (compensação corrigida — item 3)

Edição (`adminUpdateLeader`):
- `nome`: permitido; UPDATE só em `lideres_estrutura.nome`. **Nenhum UPDATE em `equipes.leader`.**
- `setorId`/`supervisorId`: se `COUNT(equipes WHERE leader_id = :id) > 0` → BLOQUEAR (`"O líder possui equipes vinculadas. Desvincule ou mova as equipes antes de alterar setor/supervisor."`). Sem equipes: revalidar `supervisor.setor_id = setorId` e aplicar setor+supervisor no MESMO UPDATE.

Exclusão (`adminDeleteLeader`) — sequência obrigatória:
1. resolver `lideres_estrutura` por `user_id`;
2. se existir `equipes.leader_id = estrutura.id` → BLOQUEAR (nada é removido);
3. **capturar snapshot em memória**: linha completa de `lideres_estrutura` (`id, user_id, nome, setor_id, supervisor_id, created_at`) e as linhas de `user_roles` com `role='leader'`;
4. `DELETE lideres_estrutura`;
5. `DELETE user_roles(leader)`;
6. `auth.admin.deleteUser(userId)`;
7. sucesso em 6 → concluir;
8. falha em 6 **e** usuário ainda existente (reconfirmado via `auth.admin.getUserById`) → **compensação best-effort**: reinserir `user_roles(leader)` e reinserir `lideres_estrutura` com o `id` original do snapshot (preserva FKs futuras);
9. compensação bem-sucedida → erro claro: exclusão abortada, estrutura restaurada;
10. compensação falha → erro **CRÍTICO** contendo `user_id`, `leader_structure_id`, `setor_id`, `supervisor_id` e `nome` do snapshot, instruindo intervenção manual.

Nunca recriar auth user automaticamente. Nunca CASCADE. Nunca apagar dados produtivos.

## 9. Criação de Equipe

Frontend envia `setorId`, `supervisorId`, `leaderId` (UUID de `lideres_estrutura.id`). Server-side:
1. `assertHierarchy` (6 checagens);
2. `auth.admin.createUser` (trigger `handle_new_team` cria a linha em `equipes`);
3. **um único** `UPDATE equipes SET setor_id, supervisor_id, leader_id, onboarded = true WHERE id = user.id`;
4. **nenhum** nome é gravado em `equipes.supervisor` / `equipes.leader` — e, comprovadamente (0.1), nenhum trigger os preenche. Em equipes novas esses campos permanecem com o valor default do trigger `handle_new_team`. Isso é aceito nesta A5; política de espelhamento é microetapa futura;
5. falha em 3 → compensação (`deleteUser`).

## 10. Edição de Equipe

`TeamRow` ganha `supervisor_id`, `leader_id`, `supervisor` (textos só para exibição/diagnóstico, rotulados como histórico). `TeamHeader` usa três selects encadeados pré-preenchidos com os UUIDs atuais. `adminUpdateTeam`:
- se qualquer um de `setorId/supervisorId/leaderId` vier definido, os três são exigidos e validados por `assertHierarchy`;
- aplicados no MESMO `patch` do UPDATE único, junto de nome/colaboradores;
- `supervisorName`/`leaderName` saem do contrato;
- **nenhum** UPDATE dos textos legados.

## 11. Validações server-side (`assertHierarchy`)

1. setor existe; 2. supervisor existe; 3. `supervisor.setor_id = setorId`; 4. líder existe; 5. `leader.setor_id = setorId`; 6. `leader.supervisor_id = supervisorId`. Mensagens específicas por falha. Nenhuma resolução por nome/ILIKE/email/login.

## 12. Selects encadeados no frontend

Setor → Supervisor (`setor_id = setor`) → Líder (`setor_id = setor AND supervisor_id = supervisor`).
- Trocar Setor limpa Supervisor e Líder incompatíveis; trocar Supervisor limpa Líder incompatível.
- Dependentes `disabled` até o ancestral estar preenchido, com placeholder explicativo.
- Submit desabilitado até os UUIDs necessários estarem preenchidos.
- Aplica-se a `CreateTeamSection`, `TeamHeader`, `LeadersSection` (setor→supervisor) e ao formulário de normalização.

## 13. Registros parcialmente normalizados (fluxo completo — correção item 4)

**Líder legado** (`user_roles.role='leader'` sem `lideres_estrutura`):
- `adminListLeaders` retorna `estrutura_normalizada: false`, com `setor_id`/`supervisor_id` nulos;
- a UI exibe badge `"Estrutura não normalizada"` e um botão "Normalizar";
- o formulário de normalização exige do administrador, explicitamente: **Nome** (pré-preenchido apenas como valor de digitação a partir do `display_name`, exigindo confirmação ativa — nunca gravado sem submit), **Setor** e **Supervisor** (encadeado);
- `adminNormalizeLeader` valida `assertHierarchy({ setorId, supervisorId })`, confirma que o `user_id` tem role `leader`, confirma que ainda não existe `lideres_estrutura` para ele, e faz o INSERT;
- líderes não normalizados não aparecem nos selects de criação/edição de Equipe;
- nenhum UUID é inferido por texto, email, login ou similaridade.

**Equipes legadas** com IDs nulos: badge `"Estrutura não normalizada"`; a edição exige seleção explícita dos três UUIDs. Nada é alterado silenciosamente. Sem migração automática.

## 14. Query keys e invalidações

Chaves: `admin-setores`, `admin-supervisores`, `admin-leaders`, `admin-teams`.

| Mutation | Invalida |
|---|---|
| setor create/update | `admin-setores` |
| setor delete | `admin-setores`, `admin-supervisores` |
| supervisor create/update/delete | `admin-supervisores` (+ `admin-leaders` em troca de setor) |
| leader create/normalize/update/delete | `admin-leaders` |
| team create/update/delete | `admin-teams` |

Sem invalidação global. Como não há mais ressincronização textual, `admin-teams` **não** é invalidada por renomeação de supervisor/líder.

## 15. Escopo de arquivos (corrigido — paridade web + Android, item 2)

Exatamente 4 arquivos funcionais:

1. `src/routes/admin.tsx` — nova `SupervisoresSection`; ordem do grupo Estrutura = `setores, supervisores, leaders, create_team`; `SetoresSection`/`SetorEditRow` sem supervisor textual; `LeadersSection` com setor+supervisor, listagem estruturada e fluxo de normalização; `CreateTeamSection` e `TeamHeader` com selects encadeados; `TeamRow` estendido.
2. `src/lib/admin.functions.ts` — funções dos itens 1–3.
3. `src/lib/admin.functions.mobile.ts` — exportar os mesmos símbolos com os mesmos tipos, seguindo o padrão `call<R>("op")` já existente: `adminListSupervisores`, `adminCreateSupervisor`, `adminUpdateSupervisor`, `adminDeleteSupervisor`, `adminUpdateLeader`, `adminNormalizeLeader`, além dos tipos de retorno atualizados de `adminListLeaders` e `listTeams`.
4. `supabase/functions/admin-api/index.ts` — novos `case` para as mesmas operações e ajuste dos `case` existentes (`adminCreateTeam`, `adminUpdateTeam`, `adminCreateLeader`, `adminListLeaders`, `adminDeleteLeader`, `adminCreateSetor`, `adminUpdateSetor`, `adminDeleteSetor`) para os novos contratos, com a MESMA lógica de validação hierárquica e compensação da versão web (o helper `assertHierarchy` é reimplementado localmente na Edge Function, já que os dois arquivos não compartilham módulo).

`mobile/**` e `android/**` NÃO são alterados — os 4 arquivos acima ficam todos em `src/` e `supabase/functions/`, apenas referenciados pelo aliasing já existente em `mobile/vite.config.ts`.

Nada fora desses 4 arquivos. Se surgir necessidade real fora do escopo: **PARAR e informar**, sem executar.

## 16. Migrations

**Zero.** Nenhuma tabela, coluna, FK, índice, trigger ou função SQL criada/alterada. A auditoria não encontrou necessidade de banco. Nenhum trigger de espelhamento será criado nesta etapa.

## 17. RLS

**Zero alterações.** Nenhuma policy criada/ampliada/removida, nenhum acesso operacional de supervisor, `app_role` intacto, A6 não antecipada. Tudo continua pelo caminho administrativo server-side (`assertAdmin` + service role).

## 18. Riscos de regressão

1. **Criação de equipe** — o trigger de integridade rejeita hierarquia inválida; mitigado por validação prévia + UPDATE único + compensação.
2. **Divergência texto × UUID** — esperada e aceita (0.1); nenhum dado histórico da A4.2 é sobrescrito. Risco: relatórios que leem `equipes.supervisor`/`leader` continuam mostrando o valor histórico. Relatórios estão congelados nesta etapa.
3. **Paridade web/Android** — divergência de contrato entre `admin.functions.ts`, `admin.functions.mobile.ts` e `admin-api` quebraria o Admin do APK; mitigado por implementação simultânea nos 4 arquivos + `npm run build:mobile`.
4. **Líderes legados** — invisíveis nos selects de equipe até normalização explícita; intencional e sinalizado.
5. **Conta de teste** (`adminCreateTestTeam`) — não é tocada.
6. **Login de equipe/líder** — inalterado (`user_roles` intacto).

## 19. Rollback

Reversão por arquivo: os 4 arquivos do item 15 voltam ao estado atual via histórico; a Edge Function requer redeploy da versão anterior. Sem migration → schema e dados não sofrem rollback. Resíduos possíveis: linhas criadas em `supervisores`/`lideres_estrutura` durante o uso, removíveis pelo próprio CRUD sem afetar `user_roles` nem equipes.

## 20. Checklist de aceite

Estrutural:
- [ ] CRUD de Supervisor existe (web + Android) e usa `setores.id`
- [ ] Nenhum relacionamento por nome digitado
- [ ] `adminCreateSetor` = `{ adminPassword, nome }`; `supervisor_nome` só compatibilidade, sem campo de UI
- [ ] Exclusão de setor bloqueia por supervisores e por equipes
- [ ] Líder exige Setor + Supervisor filtrado por setor
- [ ] `lideres_estrutura` criada junto com a conta; `user_roles.role='leader'` intacto
- [ ] `adminNormalizeLeader` completa líder legado com seleção explícita do admin
- [ ] Compensação de criação parcial implementada (líder e equipe)
- [ ] Exclusão de líder: snapshot → delete → compensação best-effort → erro CRÍTICO
- [ ] Bloqueio de mudança estrutural e de exclusão de líder com equipes vinculadas
- [ ] Equipe usa Setor + Supervisor + Líder por UUID com filtros encadeados
- [ ] Edição de equipe em UPDATE único
- [ ] Backend revalida os 6 pontos da hierarquia
- [ ] **Nenhum UPDATE automático em `equipes.supervisor` / `equipes.leader`**
- [ ] Strings históricas da A4.2 intactas
- [ ] Zero migrations, zero RLS, A6 não antecipada
- [ ] Procedimentos, offline, Dexie, sync, reports, `mobile/**`, `android/**` intactos
- [ ] Responsivo 320px → desktop, sem scroll horizontal

Testes conceituais WEB:
- [ ] CRUD Supervisor
- [ ] criar Líder normalizado
- [ ] completar Líder existente não normalizado
- [ ] editar Líder (nome / estrutura)
- [ ] bloquear mudança estrutural de Líder com equipes
- [ ] bloquear exclusão de Líder com equipes
- [ ] criar Equipe com Setor/Supervisor/Líder
- [ ] editar Equipe com UUIDs
- [ ] bloquear combinações hierárquicas inválidas

Testes conceituais ANDROID:
- [ ] Admin abre sem erro
- [ ] seção Supervisores presente
- [ ] todas as operações possuem contrato disponível no mobile
- [ ] nenhum import/export ausente após o aliasing
- [ ] `admin-api` reconhece todas as novas operações

Builds obrigatórios:
- [ ] `npx tsc --noEmit` exit 0
- [ ] `npm run build` exit 0
- [ ] `npm run build:mobile` exit 0

## 21. Declaração final

- zero migrations;
- zero RLS changes;
- zero changes em `mobile/**`;
- zero changes em `android/**`;
- 4 arquivos funcionais previstos (`src/routes/admin.tsx`, `src/lib/admin.functions.ts`, `src/lib/admin.functions.mobile.ts`, `supabase/functions/admin-api/index.ts`);
- build web obrigatório;
- build mobile obrigatório;
- nenhuma inferência de UUID por texto;
- nenhuma sobrescrita automática das strings históricas da A4.2 — comprovado que **não existe** mecanismo preexistente de espelhamento UUID → texto.

**PARADO. Aguardando nova aprovação.**
