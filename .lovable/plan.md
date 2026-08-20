# Plano de Correção Cirúrgica — Fase 1A (Identidade Interna e Proteção Histórica)

## Objetivo
Reforçar a segurança da Biblioteca de Procedimentos através de uma identidade PostgreSQL exclusiva para o fluxo de publicação e a implementação de um trigger canônico contra deleção física de versões históricas.

## 1. Identidade Interna Exclusiva
- **Papel Dedicado**: Criar o ROLE `internal_proc_executor` com `NOLOGIN` e `NOINHERIT`.
- **Isolamento Total**: 
  - Nenhuma permissão de membership será concedida a `PUBLIC`, `anon`, `authenticated`, `authenticator`, ou `service_role`.
  - Tentativas de `SET ROLE internal_proc_executor` por usuários normais serão bloqueadas pelo PostgreSQL.
- **RPC `SECURITY DEFINER`**: A função `public.publish_procedure_version` será definida como `SECURITY DEFINER` e terá seu `OWNER` alterado especificamente para `internal_proc_executor`.
- **Reconhecimento no Trigger**: O trigger de imutabilidade verificará `current_user = 'internal_proc_executor'` para permitir exclusivamente:
  - **Publicação**: `OLD.status = draft` -> `NEW.status = published` (apenas campos de status e data de publicação).
  - **Sucessão**: `OLD.status = published` -> `NEW.status = published` (apenas `vigencia_fim` e campos de auditoria).
- **Invariante**: Sem GUCs, flags de sessão ou desativação de triggers. Operações normais via API falharão ao tentar alterar conteúdo publicado pois o `current_user` não será o papel interno.

## 2. Proteção contra Deleção Física
- **Trigger Canônico**: Criar `BEFORE DELETE ON public.procedimento_versoes`.
- **Regras de Negócio**:
  - Se `OLD.status = 'draft'`: O trigger permite a operação (a RLS validará se o usuário é `leader/admin`).
  - Se `OLD.status IN ('published', 'suspended', 'archived')`: O trigger dispara `RAISE EXCEPTION`, impedindo a deleção física permanentemente, mesmo para superusers ou service_role.
- **Consolidação**: Este será o único trigger responsável pela proteção contra deleção, removendo duplicatas.

## 3. Integridade e Lock (Mantido)
- **Lock Serializado**: `SELECT 1 FROM public.procedimentos WHERE id = ... FOR UPDATE`.
- **Validação JSONB**: Rigorosa verificação da árvore (nodes, startNodeId, links, results) no PostgreSQL.
- **Sucessão Perfeita**: `V1.vigencia_fim = V2.vigencia_inicio`, garantindo continuidade absoluta.

## 4. Zona Protegida (PROIBIDO ALTERAR)
- `src/lib/sync/**`, `src/lib/offline-auth.ts`, `capacitor.config.ts`, `mobile/**`, `android/**`, tabelas operacionais existentes e suas RLS.

## 5. Testes Bloqueantes (A–AJ)
- **A-U**: RLS, RPC, matriz de status, JSONB, lock, zona protegida.
- **V-Z**: Sucessão cronológica, visibilidade por role.
- **AA-AF (Identidade)**: 
  - `authenticated/anon` sem membership no papel interno.
  - `authenticator` não pode dar `SET ROLE`.
  - Chamadas normais não apresentam `current_user = internal_proc_executor`.
  - Somente a RPC executa com a identidade dedicada.
- **AG-AJ (Deleção/Integridade)**:
  - Trigger rejeita deleção de publicados/suspensos/arquivados.
  - Drafts podem ser deletados (via RLS).
  - Proteção histórica física via trigger.

## Nota Importante
Caso o ambiente não permita a criação do ROLE `internal_proc_executor` com `NOLOGIN` e `NOINHERIT`, a execução será interrompida antes da aplicação da migration para reavaliação da arquitetura.
