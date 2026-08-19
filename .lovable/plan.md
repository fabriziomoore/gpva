# Plano de Implementação — FASE 1: Biblioteca de Procedimentos Operacionais (Revisado)

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
- Tabelas operacionais: `servicos`, `expedientes`, `equipes`, etc.

## 2. Modelo de Dados e Imutabilidade
O sistema será dividido entre identidade lógica e conteúdo operacional.
- **procedimentos**: Armazena a identidade (título, categoria, setor).
- **procedimento_versoes**: Armazena o conteúdo operacional versionado (JSONB da árvore, vigência, status).

### Regras de Imutabilidade e Histórico:
- Versões com status `published` são **IMUTÁVEIS**. Não permitem edição de árvore, vigência ou conteúdo.
- Mudanças operacionais exigem a criação de uma **NOVA VERSÃO**.
- **DELETE físico proibido** para versões publicadas. Uso de status `suspended` ou `archived` para histórico.
- **Auditoria**: Cada versão registra `created_by_id`, `updated_at`, `published_by_id` e `published_at`.

## 3. Estrutura de Banco de Dados (Supabase)
```sql
CREATE TYPE public.procedimento_status AS ENUM ('draft', 'published', 'suspended', 'archived');

CREATE TABLE public.procedimentos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    titulo TEXT NOT NULL,
    categoria TEXT NOT NULL,
    descricao TEXT,
    setor TEXT,
    responsavel_id UUID REFERENCES auth.users(id) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.procedimento_versoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    procedimento_id UUID REFERENCES public.procedimentos(id) ON DELETE RESTRICT NOT NULL,
    versao INTEGER NOT NULL,
    status public.procedimento_status NOT NULL DEFAULT 'draft',
    vigencia_inicio TIMESTAMPTZ NOT NULL,
    vigencia_fim TIMESTAMPTZ,
    fonte TEXT,
    arvore_decisao JSONB NOT NULL,
    substitui_versao_id UUID REFERENCES public.procedimento_versoes(id),
    criado_por_id UUID REFERENCES auth.users(id) NOT NULL,
    publicado_por_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    published_at TIMESTAMPTZ,
    UNIQUE(procedimento_id, versao)
);
```

## 4. Segurança e RLS
Integração com o sistema de papéis existente:
- **EQUIPE**: `SELECT` apenas de versões `published` e vigentes. `INSERT/UPDATE/DELETE` bloqueados.
- **LÍDER**: `SELECT` amplo; `INSERT` de novos procedimentos e rascunhos; `UPDATE` restrito a rascunhos; Proibição de `UPDATE/DELETE` em versões `published` via RLS/Triggers.
- **ADMIN**: Gestão administrativa preservando histórico.

## 5. Validação da Árvore de Decisão
Antes da publicação, o sistema validará:
- Existência de `startNodeId` único.
- Integridade de `nextNodeId` (sempre aponta para nó existente).
- Perguntas com opções e Resultados com instruções.
- Ausência de caminhos sem saída ou ciclos infinitos inválidos.
- Garantia de que todo caminho leva a um nó `result`.

## 6. Interface do Líder
- **Nova Rota**: `src/routes/_authenticated/leader-procedures.tsx`.
- **Componentes**: `ProcedureList` (filtros por status), `ProcedureForm`, `DecisionTreeEditor`.
- **SideMenu**: Inclusão do link "Procedimentos" visível apenas para líderes.

## 7. Testes OBRIGATÓRIOS de Não Regressão
1. Login de equipe (online/offline).
2. Integridade da Home da equipe e fluxos de expediente.
3. Lançamento de serviços e funcionamento da Outbox.
4. Status de conectividade e `SyncIndicator`.
5. Isolamento RLS (Equipe não edita/Líder não sobrescreve publicado).
6. Criação/Edição de rascunhos e Publicação de novas versões.
7. Preservação de versões anteriores e histórico.

## 8. Escopo da Fase 1
Exclusivamente infraestrutura e gestão por líderes. **NÃO** implementar assistente na home, integração com OS, cache offline de procedimentos ou IA nesta fase.

