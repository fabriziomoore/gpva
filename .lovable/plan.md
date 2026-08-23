# Plano de Correção Cirúrgica — Trigger de Integridade (v3)

## Objetivo
Corrigir a função `public.check_procedimento_versao_integrity()` para implementar regras de integridade e imutabilidade rigorosas, sem alterar a arquitetura de permissões ou triggers existente.

## Alterações Propostas

### 1. Comportamento em INSERT
Para registros novos (TG_OP = 'INSERT'):
- Validar a árvore de decisão usando: `IF NOT public.validate_procedure_tree(NEW.arvore_decisao) THEN RAISE EXCEPTION 'Estrutura da árvore inválida'; END IF;`
- Retornar `NEW`.

### 2. Comportamento em UPDATE

#### Matriz de Transições de Status
BLOQUEAR qualquer transição que não seja:
- `draft` -> `draft`
- `published` -> `suspended`
- `published` -> `archived`
- `suspended` -> `archived`

Bloqueios explícitos nesta etapa: `draft` -> `published`, `draft` -> `suspended`, `draft` -> `archived`, `published` -> `published`, `published` -> `draft`, `suspended` -> `published`, `suspended` -> `suspended`, `archived` -> `archived`, e qualquer saída de `archived`.

#### DRAFT -> DRAFT
- Permitir edição dos campos conforme regras atuais.
- Validar `arvore_decisao` se houver alteração.

#### IMUTABILIDADE HISTÓRICA
Nas transições permitidas (`published` -> `suspended`, `published` -> `archived`, `suspended` -> `archived`):
- Permitir alteração **APENAS** de: `status`, `status_updated_at`, `status_alterado_por_id`.
- **BLOQUEAR** alteração de todos os outros campos (comparados via `IS DISTINCT FROM`): `id`, `procedimento_id`, `versao`, `substitui_versao_id`, `titulo`, `categoria`, `descricao`, `setor`, `vigencia_inicio`, `vigencia_fim`, `fonte`, `arvore_decisao`, `criado_por_id`, `publicado_por_id`, `created_at`, `updated_at`, `published_at`.

### 3. Saneamento Técnico
- **Remover `SECURITY DEFINER`** (usar default INVOKER).
- Remover referências a `internal_proc_executor`, `current_user` ou lógica de identidade interna.
- Substituir `!=` e `<>` por `IS DISTINCT FROM`.
- Não usar `RECORD`, `.valid` ou `.errors`.

### 4. Congelamento de Escopo
- Não alterar: `validate_procedure_tree(jsonb)`, `publish_procedure_version(...)`, RLS, roles, memberships, outros triggers, frontend, mobile, android, auth, offline, sync, estrutura de tabelas ou dados existentes.
- Manter o trigger `trg_procedimento_versao_integrity` exatamente como está: `BEFORE INSERT OR UPDATE ON public.procedimento_versoes FOR EACH ROW EXECUTE FUNCTION public.check_procedimento_versao_integrity();`.

### 5. Entrega
- Criar **EXATAMENTE UMA** nova migration SQL.
- Nenhuma migration auxiliar, de teste ou diagnóstica.

## Validação Pós-Execução
- `security_definer = false` na função.
- Ausência de: `RECORD`, `.valid`, `.errors`, `current_user`, `internal_proc_executor`, `!=`, `<>`.
- `validate_procedure_tree` continua retornando `BOOLEAN` e seu corpo está intacto.
- Exatamente um trigger `trg_procedimento_versao_integrity` ativo e nenhum outro trigger da tabela alterado.
