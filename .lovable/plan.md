# Plano de Implementação — FASE 1: Biblioteca de Procedimentos Operacionais (Revisado Final)

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
O sistema será dividido entre identidade lógica e conteúdo operacional versionado.

### Tabelas (Supabase):
- **procedimentos**: Identidade lógica estável.
- **procedimento_versoes**: Metadados versionáveis e conteúdo operacional (JSONB). Toda informação que define o significado da orientação é armazenada aqui.

### Regras de Imutabilidade e Transições:
- **Campos Operacionais Imutáveis** (após `published`): `procedimento_id`, `versao`, `titulo`, `categoria`, `descricao`, `setor`, `vigencia_inicio`, `fonte`, `arvore_decisao`. Bloqueio via Trigger no Postgres.
- **Transições de Estado**: Permitidas apenas `published` → `suspended`, `published` → `archived`, `suspended` → `archived`.
- **Auditoria**: Registros de quem criou, quem publicou e quem alterou o estado (com timestamps).
- **Delete Físico**: Proibido para qualquer versão publicada.

```sql
CREATE TABLE public.procedimento_versoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    procedimento_id UUID REFERENCES public.procedimentos(id) NOT NULL,
    versao INTEGER NOT NULL,
    titulo TEXT NOT NULL, -- Metadados versionados
    categoria TEXT NOT NULL,
    descricao TEXT,
    setor TEXT,
    status public.procedimento_status NOT NULL DEFAULT 'draft',
    vigencia_inicio TIMESTAMPTZ NOT NULL,
    vigencia_fim TIMESTAMPTZ,
    fonte TEXT,
    arvore_decisao JSONB NOT NULL,
    criado_por_id UUID REFERENCES auth.users(id) NOT NULL,
    publicado_por_id UUID REFERENCES auth.users(id),
    status_alterado_por_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    published_at TIMESTAMPTZ,
    status_updated_at TIMESTAMPTZ
);
```

## 3. Segurança e RLS
Integração com o sistema de papéis existente:
- **EQUIPE**: `SELECT` apenas de versões `published` e vigentes. Bloqueio total de `INSERT/UPDATE/DELETE`.
- **LÍDER**: Gestão de rascunhos e publicação. Bloqueio de `UPDATE/DELETE` em conteúdo publicado via Trigger.
- **ADMIN**: Gestão administrativa total respeitando imutabilidade operacional.

## 4. Validação da Árvore
Validação rigorosa antes da publicação:
- `startNodeId` válido e IDs únicos.
- Referências íntegras para `nextNodeId`.
- Perguntas com respostas e Resultados com instruções.
- Garantia de terminação (caminhos alcançáveis levam a um nó `result`).

## 5. Interface do Líder
- Rota: `src/routes/_authenticated/leader-procedures.tsx`.
- Componentes: `ProcedureList` (filtros), `ProcedureForm`, `DecisionTreeEditor`.
- SideMenu: Link visível apenas para líderes.

## 6. Testes OBRIGATÓRIOS de Não Regressão
1. Login de equipe online.
2. Login de equipe offline.
3. Restauração da sessão offline.
4. Home da equipe permanece intacta.
5. Iniciar expediente.
6. Continuar expediente.
7. Lançar serviço.
8. Finalizar serviço.
9. Funcionamento da Dexie atual.
10. Outbox permanece intacta.
11. Itens pendentes continuam sincronizando.
12. NetworkService permanece intacto.
13. Detecção online continua funcionando.
14. Detecção offline continua funcionando.
15. backendReachable continua funcionando.
16. Alerta visual de offline continua funcionando.
17. Alerta de retorno online continua funcionando.
18. SyncIndicator continua funcionando.
19. Nenhuma alteração em capacitor.config.ts.
20. Nenhum arquivo de mobile/** alterado.
21. Nenhum arquivo de android/** alterado.
22. Equipe não visualiza gestão de Procedimentos.
23. Líder visualiza gestão de Procedimentos.
24. Líder cria rascunho.
25. Líder edita rascunho.
26. Líder publica rascunho válido.
27. Árvore inválida não pode ser publicada.
28. Versão publicada não pode ter conteúdo sobrescrito.
29. Alteração operacional gera nova versão.
30. Versão anterior permanece íntegra.
31. Equipe não consegue INSERT.
32. Equipe não consegue UPDATE.
33. Equipe não consegue DELETE.
34. Equipe consegue SELECT somente do que estiver publicado e vigente.
35. Líder respeita as regras de RLS.
36. RLS está habilitado nas novas tabelas.
37. Transição de published para suspended não altera conteúdo.
38. Histórico continua íntegro depois da suspensão/arquivamento.

## 7. Escopo da Fase 1
Exclusivamente infraestrutura e gestão. **NÃO** implementar assistente na home, integração com OS, cache offline ou IA.
