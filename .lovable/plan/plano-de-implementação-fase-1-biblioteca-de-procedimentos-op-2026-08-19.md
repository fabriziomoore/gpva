# Plano de Implementação — FASE 1: Biblioteca de Procedimentos Operacionais (Revisado v3)

Este plano estabelece a infraestrutura inicial para o módulo de Procedimentos, permitindo que líderes gerenciem árvores de decisão determinísticas com versionamento imutável e auditoria completa.

## 1. Zona Protegida (NÃO ALTERAR)
Os seguintes componentes e sistemas estão fora do escopo desta fase e não sofrerão modificações:
- `src/lib/sync/**` (Sincronização)
- `src/lib/offline-auth.ts` (Autenticação Offline)
- `src/lib/sync/session-backup.ts`
- `src/lib/db/local-db.ts` (Dexie/Banco Local)
- `src/lib/db/repos.ts` e `src/lib/db/catalogs.ts`
- `NetworkService` e `SyncIndicator`
- Stores/componentes de estado e alertas online/offline
- Sistema atual de autenticação e `capacitor.config.ts`
- Pastas `mobile/**` e `android/**`
- Outbox atual e fluxos de expediente (iniciar/continuar)
- Tabelas operacionais: `servicos`, `expedientes`, `equipes`, `vinculos_complementos`, `impactos_expediente`, `active_sessions`, `catalog_order`.

## 2. Modelo de Dados e Preservação Histórica

### Tabelas (Supabase):
- **procedimentos**: Identidade lógica estável.
    - `id` (UUID, PK)
    - `nome_logico` (TEXT) - Nome para organização estável.
    - `responsavel_id` (UUID, FK auth.users)
    - `created_at` (TIMESTAMPTZ)
    - `updated_at` (TIMESTAMPTZ)

- **procedimento_versoes**: Metadados versionáveis e conteúdo operacional.
    - `id` (UUID, PK)
    - `procedimento_id` (UUID, FK procedimentos)
    - `versao` (INTEGER)
    - `substitui_versao_id` (UUID, FK procedimento_versoes) - Rastreabilidade v1 -> v2 -> v3.
    - `titulo` (TEXT) - Metadado versionado.
    - `categoria` (TEXT)
    - `descricao` (TEXT)
    - `setor` (TEXT)
    - `status` (procedimento_status: draft, published, suspended, archived)
    - `vigencia_inicio` (TIMESTAMPTZ)
    - `vigencia_fim` (TIMESTAMPTZ)
    - `fonte` (TEXT)
    - `arvore_decisao` (JSONB)
    - `criado_por_id` (UUID, FK auth.users)
    - `publicado_por_id` (UUID, FK auth.users)
    - `status_alterado_por_id` (UUID, FK auth.users)
    - `created_at` (TIMESTAMPTZ)
    - `updated_at` (TIMESTAMPTZ) - Reflete mudanças em DRAFT.
    - `published_at` (TIMESTAMPTZ)
    - `status_updated_at` (TIMESTAMPTZ)

### Regras de Imutabilidade e Transições Controladas:
- **Imutabilidade Operacional**: Após `published`, os campos `procedimento_id`, `versao`, `titulo`, `categoria`, `descricao`, `setor`, `vigencia_inicio`, `fonte`, `arvore_decisao` tornam-se IMUTÁVEIS via Trigger/Function.
- **Vigência Final**: `vigencia_fim` não permite alteração arbitrária. Seu encerramento ocorre apenas via operações controladas (substituição/suspensão/arquivamento), registrando autor e timestamp sem alterar conteúdo operacional.
- **Transições de Status Permitidas**:
    - `draft` -> `published`
    - `published` -> `suspended`
    - `published` -> `archived`
    - `suspended` -> `archived`
- **Estado Final**: `archived` é terminal. `suspended` não volta a `published` diretamente (exige nova versão se houver mudança).
- **Exclusão**: `DELETE` permitido apenas para `draft` sem histórico. Proibido para qualquer versão publicada.

## 3. Segurança e RLS
- **EQUIPE**: `SELECT` apenas de versões `published` e vigentes (`vigencia_inicio <= now()` e `(vigencia_fim IS NULL OR vigencia_fim > now())`). Bloqueio total de `INSERT/UPDATE/DELETE`.
- **LÍDER**: Gestão de rascunhos e publicação. Bloqueio de `UPDATE` em conteúdo publicado via Trigger/Function de integridade.
- **ADMIN**: Gestão administrativa total respeitando a imutabilidade operacional histórica.

## 4. Validação da Árvore
Validação rigorosa pré-publicação:
- `startNodeId` válido e IDs únicos.
- Referências íntegras para `nextNodeId`.
- Perguntas com respostas e Resultados com instruções.
- Garantia de que todo caminho a partir do início termina em um nó `result`.

## 5. Interface do Líder
- Rota: `src/routes/_authenticated/leader-procedures.tsx`.
- Componentes: `ProcedureList`, `ProcedureForm`, `DecisionTreeEditor`.
- SideMenu: Link visível apenas para líderes.

## 6. Testes OBRIGATÓRIOS de Não Regressão (Individuais)
1. login de equipe online;
2. login de equipe offline;
3. restauração da sessão offline;
4. Home da equipe permanece intacta;
5. iniciar expediente;
6. continuar expediente;
7. lançar serviço;
8. finalizar serviço;
9. funcionamento da Dexie atual;
10. outbox permanece intacta;
11. itens pendentes continuam sincronizando;
12. NetworkService permanece intacto;
13. detecção online continua funcionando;
14. detecção offline continua funcionando;
15. backendReachable continua funcionando;
16. alerta visual de offline continua funcionando;
17. alerta de retorno online continua funcionando;
18. SyncIndicator continua funcionando;
19. nenhuma alteração em capacitor.config.ts;
20. nenhum arquivo de mobile/** alterado;
21. nenhum arquivo de android/** alterado;
22. equipe não visualiza gestão de Procedimentos;
23. líder visualiza gestão de Procedimentos;
24. líder cria rascunho;
25. líder edita rascunho;
26. líder publica rascunho válido;
27. árvore inválida não pode ser publicada;
28. versão publicada não pode ter conteúdo sobrescrito;
29. alteração operacional gera nova versão;
30. versão anterior permanece íntegra;
31. equipe não consegue INSERT;
32. equipe não consegue UPDATE;
33. equipe não consegue DELETE;
34. equipe consegue SELECT somente do que estiver publicado e vigente;
35. líder respeita as regras de RLS;
36. RLS está habilitado nas novas tabelas;
37. transição de published para suspended não altera conteúdo;
38. histórico continua íntegro depois da suspensão/arquivamento.

## 7. Escopo da Fase 1
Exclusivamente infraestrutura e gestão. **NÃO** implementar assistente na home, integração com OS, cache offline ou IA.
