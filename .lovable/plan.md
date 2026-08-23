---
name: Fase Árvore Operacional - Microetapa A (Revisão Final)
description: Fundação estrutural normalizada com RLS estrito, proteção de hierarquia em equipes e integridade cross-table.
type: feature
---

# Plano Final: Árvore Operacional Normalizada GPVA (Etapa A1)

## 1. Schema e DDL (A1)

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

-- Adição Aditiva em public.equipes
ALTER TABLE public.equipes 
ADD COLUMN supervisor_id uuid REFERENCES public.supervisores(id) ON DELETE RESTRICT,
ADD COLUMN leader_id uuid REFERENCES public.lideres_estrutura(id) ON DELETE RESTRICT;

-- Índices Obrigatórios
CREATE INDEX supervisores_setor_id_idx ON public.supervisores(setor_id);
CREATE UNIQUE INDEX supervisores_user_id_unique_idx ON public.supervisores(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX lideres_estrutura_setor_id_idx ON public.lideres_estrutura(setor_id);
CREATE INDEX lideres_estrutura_supervisor_id_idx ON public.lideres_estrutura(supervisor_id);
CREATE INDEX equipes_supervisor_id_idx ON public.equipes(supervisor_id);
CREATE INDEX equipes_leader_id_idx ON public.equipes(leader_id);
```

## 2. RLS Estrito (Admin-Only)

Para `public.supervisores` e `public.lideres_estrutura`:
- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`
- `CREATE POLICY admin_select ON ... FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));`
- `CREATE POLICY admin_insert ON ... FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));`
- `CREATE POLICY admin_update ON ... FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));`
- `CREATE POLICY admin_delete ON ... FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));`

*Nota: Sem GRANT ALL com USING. Nenhuma permissão para roles não-admin nesta fase.*

## 3. Integridade e Hierarquia (Triggers BEFORE)

### A. Integridade Cross-Table (Regras de Negócio)
- **Em `lideres_estrutura`:** `supervisor.setor_id` deve ser igual a `NEW.setor_id`.
- **Em `equipes`:** 
    - Se `supervisor_id` preenchido: `supervisor.setor_id = NEW.setor_id`.
    - Se `leader_id` preenchido: `leader.setor_id = NEW.setor_id` E `supervisor_id` não pode ser NULL.
    - Se ambos preenchidos: `leader.supervisor_id = NEW.supervisor_id`.

### B. Proteção de Equipes (Imutabilidade Hierárquica)
Trigger `BEFORE UPDATE` em `public.equipes`:
- Se `auth.uid() = OLD.id` (equipe editando a própria linha) E usuário NÃO for admin:
    - Impedir alteração (`IS DISTINCT FROM`) em: `setor_id`, `supervisor_id`, `leader_id`.

## 4. Sincronização e Legado
- Trigger em `equipes` atualiza os campos `text` (`supervisor`, `leader`) apenas se o ID UUID correspondente for preenchido.
- Se ID for NULL, manter o texto existente (transição progressiva).
- Proibido recalcular IDs a partir de textos.

## 5. Critérios de Aceite A1
- Exatamente **uma migration**.
- Equipes não conseguem alterar sua própria posição na árvore.
- `leader_id` não pode existir sem `supervisor_id`.
- Campos textuais legados intactos em registros com IDs nulos.
- RLS separada por operação (SELECT/INSERT/UPDATE/DELETE).
- Zero alterações em Procedimentos, Frontend ou Mobile.

## 6. Escopo e Rollback
- A1 é puramente estrutural: zero dados afetados.
- Rollback via `DROP` de triggers, policies e colunas/tabelas na ordem segura enquanto dados novos forem nulos.
- Preservar `updated_at` via triggers simples dedicados (sem reutilizar funções globais).
