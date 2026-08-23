---
name: Fase Árvore Operacional - Microetapa A
description: Planejamento para normalização da estrutura Setor -> Supervisor -> Líder -> Equipe com entidades UUID.
type: feature
---
# Planejamento: Árvore Operacional Normalizada GPVA (Microetapa A)

## 1. Schema Proposto (DDL)

```sql
-- Entidade de Supervisores
CREATE TABLE public.supervisores (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nome text NOT NULL,
    setor_id uuid NOT NULL REFERENCES public.setores(id),
    user_id uuid REFERENCES auth.users(id),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(user_id) -- Um usuário só pode ser supervisor de uma estrutura (ou null)
);

-- Entidade de Estrutura de Líderes
CREATE TABLE public.lideres_estrutura (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id),
    nome text NOT NULL,
    setor_id uuid NOT NULL REFERENCES public.setores(id),
    supervisor_id uuid NOT NULL REFERENCES public.supervisores(id),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(user_id)
);

-- Alterações Aditivas em Equipes
ALTER TABLE public.equipes 
ADD COLUMN supervisor_id uuid REFERENCES public.supervisores(id),
ADD COLUMN leader_id uuid REFERENCES public.lideres_estrutura(id);
```

## 2. Estratégia de Consistência (Integridade Estrutural)

Para garantir que a árvore `Setor -> Supervisor -> Líder -> Equipe` seja coerente (ex: líder e supervisor no mesmo setor), utilizaremos **Constraints de Validação Cross-Table**:

- **Constraint em `lideres_estrutura`**: `CHECK` via trigger ou FK composta (se possível) para garantir que `supervisor_id.setor_id = setor_id`.
- **Constraint em `equipes`**: 
    - `supervisor_id.setor_id = setor_id`
    - `leader_id.setor_id = setor_id`
    - `leader_id.supervisor_id = supervisor_id`

*Abordagem Técnica:* Utilizaremos triggers `BEFORE INSERT OR UPDATE` em `lideres_estrutura` e `equipes` para validar estas correspondências no lado do servidor, impedindo estados inconsistentes via API direta.

## 3. Estratégia de Migração e Compatibilidade

1.  **Compatibilidade:** Os campos `equipes.supervisor` (text) e `equipes.leader` (text) permanecem.
2.  **Sincronização:** Triggers em `equipes` atualizarão os campos textuais baseados no `nome` das entidades UUID associadas (`supervisor_id` e `leader_id`), preservando relatórios legados e cache offline sem mudar o frontend agora.
3.  **Migração Determinística:** 
    - Criação manual dos Supervisores (ex: Ricardo Cunha) vinculando ao UUID do Setor.
    - Criação manual dos vínculos de Líderes (Gabriel Araújo, Wanderley) vinculando ao Supervisor e Setor.
    - Update em `equipes` preenchendo os IDs apenas onde a correspondência for exata e auditada.

## 4. RLS Proposta

- **Supervisores / Lideres_estrutura:**
    - `SELECT`: `authenticated` (para preenchimento de combos e visualização).
    - `ALL`: `public.has_role(auth.uid(), 'admin')`.
- **Equipes:** Políticas existentes mantidas; novas colunas seguem a visibilidade da linha.

## 5. Plano de Execução (Microetapas)

1.  **Etapa A1:** Migração de banco (Tabelas e RLS).
2.  **Etapa A2:** Implementação dos triggers de integridade estrutural e sincronização legada.
3.  **Etapa A3:** Auditoria e carga manual de Dados Mestres (Setores -> Supervisores -> Líderes).
4.  **Etapa A4:** Vínculo das Equipes existentes aos novos IDs (Update auditado).
5.  **Etapa A5 (Futura):** Refatoração do Admin para CRUD usando os novos campos.

## 6. Riscos e Rollback

- **Risco:** Inconsistência entre o nome textual e o UUID durante a transição.
- **Rollback:** As colunas novas são `NULLABLE`, bastando removê-las ou ignorá-las; a lógica textual legada continua operando como fallback primário.

---
*Nota: Este plano respeita a imutabilidade dos Procedimentos Operacionais e não altera arquivos de sincronização offline ou mobile nesta fase.*
