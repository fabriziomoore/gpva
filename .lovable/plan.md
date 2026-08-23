---
name: Fase Árvore Operacional - Microetapa A (Revisão 2)
description: Fundação estrutural normalizada (Setor -> Supervisor -> Líder -> Equipe) com integridade rigorosa e RLS admin-only.
type: feature
---

# Plano: Árvore Operacional Normalizada GPVA

## 1. Schema Estrutural (A1)

```sql
-- public.supervisores
CREATE TABLE public.supervisores (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nome text NOT NULL,
    setor_id uuid NOT NULL REFERENCES public.setores(id) ON DELETE RESTRICT,
    user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- public.lideres_estrutura
CREATE TABLE public.lideres_estrutura (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE RESTRICT,
    nome text NOT NULL,
    setor_id uuid NOT NULL REFERENCES public.setores(id) ON DELETE RESTRICT,
    supervisor_id uuid NOT NULL REFERENCES public.supervisores(id) ON DELETE RESTRICT,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- public.equipes (Alterações Aditivas)
ALTER TABLE public.equipes 
ADD COLUMN supervisor_id uuid REFERENCES public.supervisores(id) ON DELETE RESTRICT,
ADD COLUMN leader_id uuid REFERENCES public.lideres_estrutura(id) ON DELETE RESTRICT;
```

## 2. Índices

- `INDEX supervisores(setor_id)`
- `UNIQUE INDEX supervisores_user_id_idx ON supervisores(user_id) WHERE user_id IS NOT NULL`
- `INDEX lideres_estrutura(setor_id)`
- `INDEX lideres_estrutura(supervisor_id)`
- `INDEX equipes(supervisor_id)`
- `INDEX equipes(leader_id)`

## 3. Segurança (RLS Admin-Only)

- `ALTER TABLE public.supervisores ENABLE ROW LEVEL SECURITY;`
- `ALTER TABLE public.lideres_estrutura ENABLE ROW LEVEL SECURITY;`
- **Policy:** `GRANT ALL ON public.supervisores/lideres_estrutura TO authenticated USING (public.has_role(auth.uid(), 'admin'));`
- Nenhuma permissão de `SELECT` para usuários comuns (leader/supervisor) nesta fase.
- `public.equipes`: RLS mantido sem alterações.

## 4. Integridade Cross-Table (Triggers Estruturais)

Implementação de triggers `BEFORE INSERT OR UPDATE` para validar a coerência da árvore:

- **Em `lideres_estrutura`:** Validar que o `supervisor_id` selecionado pertence ao mesmo `setor_id` do registro.
- **Em `equipes`:** 
    - Se `supervisor_id` preenchido: `supervisor.setor_id = NEW.setor_id`.
    - Se `leader_id` preenchido: `leader.setor_id = NEW.setor_id`.
    - Se ambos preenchidos: `leader.supervisor_id = NEW.supervisor_id`.

## 5. Sincronização Legada (Unidirecional)

- Novos campos UUID tornam-se a **Source of Truth**.
- Trigger em `equipes` atualizará `equipes.supervisor` (text) e `equipes.leader` (text) apenas quando seus respectivos IDs forem não-nulos.
- **PROIBIDO:** Atualizar IDs a partir de alterações nos campos textuais.

## 6. Dados Existentes (Auditoria)

**Estado Auditado:**
- Setor: `Corte e Religa`
- Líder Real: `Gabriel Aráujo` (`6a17b5a5-6716-4af4-b567-743596b1a2c7`)
- Variações Legadas (ex: `Ricardo Cunha` com espaços) não serão migradas automaticamente.
- Carga de dados apenas via mapeamento auditado posterior à A1.

## 7. Microetapas de Execução

1.  **A1 — Fundação Estrutural:** Uma única migration com DDL, Triggers e RLS admin-only. Zero dados.
2.  **A2 — Auditoria:** Geração de relatório `texto legado` -> `entidade proposta` (Read-only).
3.  **A3 — Carga:** Inserção controlada de Supervisores e Vínculos de Líderes aprovados.
4.  **A4 — Vinculação:** Updates determinísticos por UUID em `equipes`.
5.  **A5 — Admin:** Interface de gerenciamento (Supervisor/Líder/Equipe) com filtros encadeados.
6.  **A6 — Visibilidade:** Expansão das políticas de RLS para acesso operacional.

## 8. Critérios de Aceite (A1)

- Exatamente uma migration nova.
- Zero alteração em `equipes.supervisor` ou `equipes.leader` existentes.
- Triggers bloqueiam combinações de IDs de setores diferentes.
- Procedimentos Operacionais, Offline e Mobile permanecem intactos.

## 9. Plano de Rollback

- **Etapa A1:** Remoção segura de triggers, políticas, colunas e tabelas (ordem inversa) enquanto os dados forem nulos.
- **Após Carga:** Exportação de vínculos antes da remoção. Campos legados nunca são apagados.
