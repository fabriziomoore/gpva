# Plano de Correção Cirúrgica — Trigger de Integridade

## Objetivo
Corrigir a função public.check_procedimento_versao_integrity() para implementar regras de integridade e imutabilidade rigorosas, sem alterar a arquitetura de permissões ou triggers existente.

## Alterações Propostas

### 1. Banco de Dados (SQL)
Criar uma nova migration para atualizar a função de trigger:

- **Remover SECURITY DEFINER**: A função passará a ser SECURITY INVOKER (padrão).
- **Saneamento de Lógica**: Remover referências a internal_proc_executor, current_user e variáveis de controle interno.
- **Validação de Inserção**:
  - Validar a arvore_decisao usando public.validate_procedure_tree(NEW.arvore_decisao).
- **Validação de Atualização**:
  - **Draft**: Bloquear transição draft -> published (será tratada via RPC em etapa futura).
  - **Transições Permitidas**: Apenas published -> suspended, published -> archived, e suspended -> archived.
  - **Imutabilidade**: Em transições válidas de estados históricos, permitir alteração **apenas** dos campos status, status_updated_at e status_alterado_por_id.
  - **Proteção de Campos**: Todos os outros campos (id, procedimento_id, versao, titulo, arvore_decisao, etc.) serão protegidos contra qualquer alteração usando IS DISTINCT FROM.
  - **Bloqueio de No-Op**: Bloquear published -> published mesmo se os dados forem idênticos ou se apenas a vigência mudar (nesta etapa).
- **Operadores**: Substituir todos os operadores != e <> por IS DISTINCT FROM.

## Validação Pós-Execução (Read-Only)
1. Verificar se public.check_procedimento_versao_integrity não possui mais prosecdef como true.
2. Confirmar a ausência de strings proibidas (internal_proc_executor, !=, RECORD).
3. Validar que o trigger trg_procedimento_versao_integrity permanece ativo e vinculado à função correta.