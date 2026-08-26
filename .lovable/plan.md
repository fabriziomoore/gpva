# A5 — ADMIN DA ESTRUTURA OPERACIONAL (PLANO — NÃO EXECUTADO)

Auditoria do estado real concluída sobre `src/routes/admin.tsx` (2113 linhas) e `src/lib/admin.functions.ts` (842 linhas). Nenhum arquivo foi modificado.

## 0. Achados da auditoria (estado real)

- `SECTION_GROUPS.estrutura` = `["setores", "create_team", "leaders"]` — não existe seção Supervisores.
- `SetoresSection` / `SetorEditRow` pedem "Nome do supervisor" como texto livre (`setores.supervisor_nome`).
- `CreateTeamSection` usa `setorId` (UUID) + `leaderName` (string, valor da option = `display_name || login`). Não há supervisor.
- `TeamHeader` edita `leaderName` textual; `TeamRow` não possui `supervisor_id` nem `leader_id`.
- `LeadersSection` chama `adminCreateLeader(leaderName, login, password)` → cria `auth.users` + `user_roles(leader)`. Não cria `lideres_estrutura`.
- `adminDeleteLeader` executa `auth.admin.deleteUser` direto, sem verificação de vínculos.
- Não existe nenhuma função de CRUD para `public.supervisores`.
- `adminDeleteSetor` só bloqueia por equipes; ignora supervisores vinculados.
- `types.ts` já contém `supervisores`, `lideres_estrutura`, `equipes.supervisor_id/leader_id`; `PostgrestVersion: "14.5"`. Nenhuma divergência técnica encontrada → **nenhuma regeneração proposta**.

## 1. Funções atuais que serão alteradas (`src/lib/admin.functions.ts`)

| Função | Alteração |
|---|---|
| `adminCreateSetor` | remove `supervisorNome` do contrato de relacionamento (parâmetro passa a opcional e não usado como estrutura; grava `supervisor_nome: ''` apenas se ausente, preservando o legado existente) |
| `adminUpdateSetor` | deixa de aceitar `supervisorNome` |
| `adminDeleteSetor` | acrescenta bloqueio explícito por supervisores vinculados (antes do bloqueio de equipes) |
| `adminCreateLeader` | passa a exigir `setorId` + `supervisorId`; cria `lideres_estrutura`; compensação |
| `adminListLeaders` | passa a retornar estrutura normalizada (join com `lideres_estrutura`, `setores`, `supervisores`) |
| `adminDeleteLeader` | bloqueio por equipes; remove `lideres_estrutura` antes do auth user |
| `adminCreateTeam` | `leaderName` → `supervisorId` + `leaderId`; validação hierárquica; UPDATE único; compensação |
| `adminUpdateTeam` | `leaderName` → `supervisorId` + `leaderId`; validação; UPDATE único |
| `listTeams` | select passa a incluir `supervisor_id`, `leader_id`, `supervisor` |

## 2. Novas funções necessárias

- `adminListSupervisores`
- `adminCreateSupervisor`
- `adminUpdateSupervisor`
- `adminDeleteSupervisor`
- Helper interno privado `assertHierarchy(supabaseAdmin, { setorId, supervisorId?, leaderId? })` — única fonte de validação server-side reaproveitada por equipe e líder.

## 3. Assinaturas antes/depois

```text
adminCreateSetor
  antes: { adminPassword, nome, supervisorNome }
  depois: { adminPassword, nome }

adminUpdateSetor
  antes: { adminPassword, setorId, nome?, supervisorNome? }
  depois: { adminPassword, setorId, nome? }

adminCreateLeader
  antes: { adminPassword, leaderName, login, password }
  depois: { adminPassword, leaderName, login, password, setorId, supervisorId }

adminListLeaders
  antes: -> { id, email, login, display_name }[]
  depois: -> { user_id, leader_structure_id, nome, login, email,
               setor_id, setor_nome, supervisor_id, supervisor_nome }[]

adminUpdateLeader  (NOVA — renomear e/ou reestruturar)
  { adminPassword, leaderStructureId, nome?, setorId?, supervisorId? }

adminDeleteLeader
  antes: { adminPassword, leaderId }
  depois: { adminPassword, leaderUserId }   // resolve leader_structure_id server-side

adminCreateTeam
  antes: { adminPassword, teamName, password, setorId, leaderName }
  depois: { adminPassword, teamName, password, setorId, supervisorId, leaderId }

adminUpdateTeam
  antes: { ..., setorId?, leaderName? }
  depois: { ..., setorId?, supervisorId?, leaderId? }   // trio exigido em conjunto

adminListSupervisores  { adminPassword }
  -> { id, nome, setor_id, setor_nome, user_id }[]
adminCreateSupervisor  { adminPassword, nome, setorId } -> { ok }
adminUpdateSupervisor  { adminPassword, supervisorId, nome?, setorId? } -> { ok }
adminDeleteSupervisor  { adminPassword, supervisorId } -> { ok }
```

## 4. Fluxo — criação de Supervisor

Nome + Setor (select por `setores.id`). Server-side: setor existe → INSERT em `supervisores { nome, setor_id }`, `user_id` fica NULL. Nenhuma conta de login é criada (isso é A6).

## 5. Fluxo — edição/exclusão de Supervisor

Edição:
- Só `nome`: permitido sempre. Após o UPDATE, ressincronizar o espelho textual das equipes vinculadas (`UPDATE equipes SET supervisor = <novo nome> WHERE supervisor_id = :id`) — espelho, nunca fonte de verdade.
- `setorId` diferente do atual: contar líderes (`lideres_estrutura.supervisor_id`) e equipes (`equipes.supervisor_id`). Se houver qualquer um > 0 → erro `"Supervisor possui líderes/equipes vinculados. Mova-os antes de alterar o setor."` Se zero, permitido.

Exclusão: bloquear se houver líder vinculado; bloquear se houver equipe vinculada; mensagens distintas. Só então DELETE. Nunca CASCADE.

## 6. Fluxo — criação de Líder

Campos: Nome, Login, Senha, Setor, Supervisor (encadeado). Server-side em ordem:
1. `assertAdmin`, senha ≥ 6, login sanitizado.
2. `assertHierarchy({ setorId, supervisorId })` → setor existe; supervisor existe; `supervisor.setor_id = setorId`.
3. `auth.admin.createUser`.
4. `user_roles.upsert(role='leader')`.
5. `INSERT lideres_estrutura { user_id, nome, setor_id, supervisor_id }`.

## 7. Compensação para falha parcial (auth + estrutura)

Passos 4 e 5 ficam em `try`. Em qualquer erro:
- `DELETE FROM lideres_estrutura WHERE user_id = novo` (best-effort);
- `DELETE FROM user_roles WHERE user_id = novo AND role='leader'` (best-effort);
- `auth.admin.deleteUser(novo)`;
- rethrow com mensagem original + sufixo `"(conta revertida)"`. Se a própria compensação falhar, erro explícito instruindo remoção manual — nunca silenciar.

O mesmo padrão vale para `adminCreateTeam` (passo 3 → compensação do auth user criado).

## 8. Fluxo — edição/exclusão de Líder

Edição (`adminUpdateLeader`):
- `nome`: permitido; UPDATE em `lideres_estrutura.nome` + ressincronização do espelho `equipes.leader WHERE leader_id = :id`.
- `setorId`/`supervisorId`: se `COUNT(equipes WHERE leader_id = :id) > 0` → **BLOQUEAR** com `"O líder possui equipes vinculadas. Desvincule ou mova as equipes antes de alterar setor/supervisor."` Sem equipes: revalidar `supervisor.setor_id = setorId` e aplicar setor+supervisor no MESMO UPDATE.

Exclusão (`adminDeleteLeader`):
1. resolver `lideres_estrutura` por `user_id`;
2. se houver `equipes.leader_id = estrutura.id` → BLOQUEAR;
3. `DELETE lideres_estrutura`;
4. `DELETE user_roles(leader)`;
5. `auth.admin.deleteUser`;
6. se 5 falhar após 3/4, erro claro apontando conta órfã de auth (nunca recriar estrutura automaticamente). Sem CASCADE, sem apagar equipes ou dados produtivos.

## 9. Fluxo — criação de Equipe

Frontend envia `setorId`, `supervisorId`, `leaderId` (UUID de `lideres_estrutura.id`). Server-side:
1. `assertHierarchy({ setorId, supervisorId, leaderId })` — 6 checagens do item 9 do briefing.
2. `auth.admin.createUser` (trigger `handle_new_team` cria a linha em `equipes`).
3. **Um único** `UPDATE equipes SET setor_id, supervisor_id, leader_id, onboarded = true WHERE id = user.id`.
4. Nenhum nome enviado pelo frontend é gravado em `equipes.supervisor` / `equipes.leader` — o espelhamento é responsabilidade dos triggers existentes.
5. Falha no passo 3 → compensação (deleteUser).

## 10. Fluxo — edição de Equipe

`TeamRow` ganha `supervisor_id`, `leader_id`, `supervisor` (textos apenas para exibição/fallback). `TeamHeader` usa três selects encadeados pré-preenchidos com os UUIDs atuais. `adminUpdateTeam`:
- se qualquer um de `setorId/supervisorId/leaderId` vier definido, os três são exigidos juntos e validados via `assertHierarchy`;
- aplicados no **mesmo** objeto `patch` do UPDATE único, junto de nome/colaboradores — nunca em três UPDATEs sequenciais;
- `supervisorName`/`leaderName` deixam de existir no contrato.

## 11. Validações server-side (`assertHierarchy`)

1. setor existe em `setores`;
2. supervisor existe em `supervisores`;
3. `supervisor.setor_id = setorId`;
4. líder existe em `lideres_estrutura`;
5. `leader.setor_id = setorId`;
6. `leader.supervisor_id = supervisorId`.

Mensagens de erro específicas por falha. Nenhuma resolução por nome/ILIKE/e-mail/login.

## 12. Selects encadeados no frontend

Setor → Supervisor (`supervisores.setor_id = setor`) → Líder (`leader.setor_id = setor AND leader.supervisor_id = supervisor`).
- Trocar Setor: limpa Supervisor e Líder incompatíveis.
- Trocar Supervisor: limpa Líder incompatível.
- Selects dependentes ficam `disabled` até o ancestral estar preenchido, com placeholder explicativo.
- Botão de submit desabilitado até os três UUIDs estarem preenchidos.
- Aplica-se a `CreateTeamSection`, `TeamHeader` e `LeadersSection` (setor→supervisor).

## 13. Registros parcialmente normalizados

Nenhuma migração/inferência. Equipes com `setor_id`/`supervisor_id`/`leader_id` nulos exibem badge `"Estrutura não normalizada"` e exigem seleção explícita dos três antes de salvar. Nada é alterado silenciosamente.

## 14. Query keys e invalidações

Chaves: `admin-setores`, `admin-supervisores`, `admin-leaders`, `admin-teams`.

| Mutation | Invalida |
|---|---|
| setor create/update/delete | `admin-setores` (+ `admin-supervisores` no delete) |
| supervisor create/delete | `admin-supervisores` |
| supervisor rename | `admin-supervisores`, `admin-teams` (espelho) |
| supervisor troca de setor | `admin-supervisores`, `admin-leaders` |
| leader create/delete | `admin-leaders` |
| leader rename | `admin-leaders`, `admin-teams` (espelho) |
| leader reestrutura | `admin-leaders` |
| team create/update | `admin-teams` |

Sem `invalidateQueries()` global.

## 15. Arquivos exatos modificados

1. `src/routes/admin.tsx` — nova `SupervisoresSection`, ordem do grupo Estrutura (`setores, supervisores, leaders, create_team`), `SetoresSection`/`SetorEditRow` sem supervisor textual, `LeadersSection` com setor+supervisor e listagem estruturada, `CreateTeamSection` e `TeamHeader` com selects encadeados, `TeamRow` estendido, `listTeams` consumido com novos campos.
2. `src/lib/admin.functions.ts` — funções do item 1/2/3.

Nenhum outro arquivo. Nenhuma migration.

**Ponto de decisão a aprovar antes da execução:** `src/lib/admin.functions.mobile.ts` (+ `supabase/functions/admin-api/index.ts`) são o espelho do Admin usado pelo APK, com aliasing em `mobile/vite.config.ts`. Se as assinaturas mudarem apenas na versão web, o build mobile continua compilando (tipos genéricos), porém o Admin do APK ficaria funcionalmente defasado. Recomendação: **manter fora do escopo da A5** (congelamento do item 17) e tratar a paridade mobile em etapa própria. Se você quiser paridade já na A5, avise — isso adiciona 2 arquivos ao escopo.

## 16. Migrations

Zero. Nenhuma tabela, coluna, FK, trigger, função ou índice é criado/alterado. Não foi encontrada nenhuma necessidade real de banco durante a auditoria.

## 17. RLS

Zero alterações. Nenhuma policy criada, ampliada ou removida. Nenhum acesso de supervisor, nenhuma mudança em `app_role`, nenhuma antecipação da A6. Todas as operações continuam pelo caminho administrativo server-side com `assertAdmin` + `supabaseAdmin`.

## 18. Riscos de regressão

1. **Criação de equipe** — maior risco: o trigger `handle_new_team` roda antes do UPDATE estrutural; o trigger de integridade pode rejeitar o UPDATE se a hierarquia for inválida. Mitigado por validação prévia + UPDATE único + compensação.
2. **Espelhos legados** — se os triggers já espelham `supervisor_id → supervisor`, a ressincronização manual em rename vira redundante (inofensiva). Verificar em execução e remover se duplicada.
3. **Líderes existentes sem `lideres_estrutura`** — aparecem na lista sem setor/supervisor e não poderão ser escolhidos em Equipe até serem completados; comportamento intencional e sinalizado na UI, não é inferido.
4. **Conta de teste** (`adminCreateTestTeam`) — não é tocada; continua sem estrutura normalizada.
5. **Login de equipe/líder** — inalterado (`user_roles` intacto).
6. **Mobile/APK** — ver item 15.

## 19. Rollback

Reversão por arquivo: os dois arquivos do item 15 voltam ao estado atual via histórico. Como não há migration, dados e schema não sofrem rollback. Efeitos residuais possíveis: linhas de `lideres_estrutura` e `supervisores` criadas durante o uso — removíveis pelo próprio CRUD sem afetar `user_roles` nem equipes.

## 20. Checklist de aceite

- [ ] CRUD de Supervisor existe e usa `setores.id`
- [ ] Nenhum relacionamento por nome digitado
- [ ] Setor não pede mais supervisor textual
- [ ] Exclusão de setor bloqueia por supervisores e por equipes
- [ ] Líder exige Setor + Supervisor, supervisor filtrado por setor
- [ ] `lideres_estrutura` criada junto com a conta; `user_roles.role='leader'` intacto
- [ ] Compensação de falha parcial implementada (líder e equipe)
- [ ] Exclusão de líder bloqueada com equipes vinculadas
- [ ] Equipe usa Setor + Supervisor + Líder por UUID, com filtros encadeados
- [ ] Edição de equipe usa os mesmos UUIDs em UPDATE único
- [ ] Backend revalida os 6 pontos da hierarquia
- [ ] Campos legados apenas como espelho
- [ ] Zero migrations, zero mudanças de RLS, A6 não antecipada
- [ ] Sem regressão em criação/login de equipe e líder
- [ ] Procedimentos, offline, mobile, android intactos
- [ ] Responsivo de 320px a desktop, sem scroll horizontal, selects `w-full h-11`
- [ ] `npx tsc --noEmit` e `npm run build` exit 0
