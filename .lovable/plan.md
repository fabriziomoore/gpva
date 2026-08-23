# Plano de Correção Cirúrgica — Versionamento e Volatilidade da Trigger (Final)

## Objetivo
Corrigir os desvios da execução anterior versionando a lógica da trigger `public.check_procedimento_versao_integrity()` através de uma migration oficial e restaurando a volatilidade padrão (`VOLATILE`).

## Protocolo de Execução Rigoroso

### 1. Proibição de SQL Avulso
- **TODA** alteração de estado deve ocorrer **EXCLUSIVAMENTE** dentro da migration única.
- É estritamente **PROIBIDO** executar comandos SQL que modifiquem o banco (DDL ou DML) fora da migration.
- Ferramentas de SQL serão usadas apenas para consultas `READ-ONLY/SELECT` após a execução da migration.

### 2. Congelamento de Escopo
- **NÃO ALTERAR**: `validate_procedure_tree`, `publish_procedure_version`, RLS, roles, memberships, outros triggers, frontend, mobile, auth, ou qualquer dado/estrutura existente.
- A única alteração permitida é a redefinição da função `check_procedimento_versao_integrity()` dentro da migration.

### 3. Migration Única
Criar **EXATAMENTE UMA** migration SQL contendo:
- `CREATE OR REPLACE FUNCTION public.check_procedimento_versao_integrity()`.
- **Volatilidade**: Não declarar `STABLE` ou `IMMUTABLE` (garantir `provolatile = 'v'`).
- **Segurança**: Não declarar `SECURITY DEFINER` (garantir `prosecdef = false`).
- **Lógica**: Preservar exatamente a lógica de integridade e imutabilidade aprovada na etapa anterior.

## Validação Pós-Execução (Read-Only)
- Confirmar `provolatile = 'v'` e `prosecdef = false` para a função.
- Verificar a existência da entrada correspondente em `supabase_migrations.schema_migrations`.
- Validar que a lógica funcional permanece intacta.
- Confirmar que nenhum outro trigger ou estrutura foi modificado.
