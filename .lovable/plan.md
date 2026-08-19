# Plano de Implementação — FASE 1: Biblioteca de Procedimentos Operacionais

Este plano descreve a infraestrutura inicial para o módulo de Procedimentos, permitindo que líderes gerenciem árvores de decisão determinísticas.

## Objetivos
- Criar tabelas no banco de dados para procedimentos e suas versões.
- Implementar interface para líderes criarem e editarem procedimentos.
- Garantir segurança via RLS (equipes não podem editar).
- Preservar integridade de arquivos críticos/protegidos.

## Detalhes Técnicos

### 1. Banco de Dados (Supabase Migration)
Criaremos as tabelas `procedimentos` e `procedimento_versoes`:

```sql
CREATE TYPE public.procedimento_status AS ENUM ('draft', 'published', 'suspended', 'archived');

CREATE TABLE public.procedimentos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    titulo TEXT NOT NULL,
    categoria TEXT NOT NULL,
    descricao TEXT,
    setor TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    substituido_por_id UUID REFERENCES public.procedimentos(id),
    responsavel_id UUID REFERENCES auth.users(id) NOT NULL
);

CREATE TABLE public.procedimento_versoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    procedimento_id UUID REFERENCES public.procedimentos(id) ON DELETE CASCADE NOT NULL,
    versao INTEGER NOT NULL,
    status public.procedimento_status NOT NULL DEFAULT 'draft',
    vigencia_inicio TIMESTAMPTZ NOT NULL,
    vigencia_fim TIMESTAMPTZ,
    fonte TEXT,
    arvore_decisao JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    published_at TIMESTAMPTZ,
    criado_por_id UUID REFERENCES auth.users(id) NOT NULL,
    UNIQUE(procedimento_id, versao)
);
```

### 2. Segurança (RLS)
- **Líder/Admin**: Acesso total (SELECT, INSERT, UPDATE).
- **Equipe**: Apenas SELECT em procedimentos com status `published` e vigentes (vigencia_inicio <= agora < vigencia_fim).

### 3. Interface (UI)
- Novo arquivo: `src/routes/_authenticated/leader-procedures.tsx`.
- Componentes em `src/components/procedures/`:
    - `ProcedureList.tsx`: Listagem com filtros.
    - `ProcedureForm.tsx`: Cadastro de metadados.
    - `DecisionTreeEditor.tsx`: Editor visual simples para a árvore JSON.
- Modificação em `src/components/layout/SideMenu.tsx` para adicionar o link ao menu do líder.

### 4. Validação e Testes
- Validar integridade da árvore (nó inicial, referências circulares, nextNodeId).
- Testar isolamento de acesso por papel de usuário.
- Garantir que o fluxo de expediente offline não seja afetado.

## Arquivos Protegidos (NÃO SERÃO ALTERADOS)
- `src/lib/sync/**`
- `src/lib/offline-auth.ts`
- `src/lib/db/local-db.ts`
- `src/lib/db/repos.ts`
- Tabelas de expediente e serviços.
