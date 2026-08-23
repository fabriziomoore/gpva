# Plano de Correção Cirúrgica — Versionamento e Volatilidade da Trigger

## Objetivo
Corrigir os desvios da execução anterior versionando a lógica da trigger `public.check_procedimento_versao_integrity()` através de uma migration oficial e restaurando a volatilidade padrão (`VOLATILE`).

## Alterações Propostas

### 1. Versionamento via Migration
Criar **EXATAMENTE UMA** nova migration SQL para formalizar o estado da função. Esta migration irá:
- Executar `CREATE OR REPLACE FUNCTION public.check_procedimento_versao_integrity()`.
- **REMOVER** a declaração `STABLE` (restaurando o padrão `VOLATILE`).
- Manter a função como `SECURITY INVOKER` (sem `SECURITY DEFINER`).
- Preservar a lógica funcional aprovada (validação de árvore em INSERT, transições de status permitidas, e imutabilidade dos 17 campos históricos via `IS DISTINCT FROM`).

### 2. Congelamento de Escopo
- **NÃO ALTERAR**: `validate_procedure_tree`, `publish_procedure_version`, RLS, roles, memberships, gatilhos (triggers), frontend ou estrutura de tabelas.
- A migração deve conter apenas a redefinição da função para ajuste de volatilidade e registro no histórico de migrações.

## Validação Pós-Execução (Read-Only)
- Confirmar `provolatile = 'v'` (VOLATILE) para a função.
- Confirmar `prosecdef = false` (SECURITY INVOKER).
- Verificar que a nova migration consta em `supabase_migrations.schema_migrations`.
- Validar que o trigger `trg_procedimento_versao_integrity` permanece ativo e que a função mantém a lógica de integridade aprovada.
