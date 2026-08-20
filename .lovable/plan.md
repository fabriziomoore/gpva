# Plano de Correção Final - Fase 1A (Procedimentos)

Este plano consolida as correções de segurança e integridade para a Fase 1A, focando em sucessão controlada, imutabilidade rigorosa e auditoria server-side.

## Arquivos a Alterar
- `supabase/migrations/20260820000000_fase1a_correcao_final.sql` (Nova migration)
- `src/routes/_authenticated/leader-procedures.tsx` (UI de gestão e chamada RPC)
- `src/components/procedures/ProcedureForm.tsx` (Ajuste de vigência e metadados)

## 1. Banco de Dados (PostgreSQL)

### Migration de Segurança e Integridade
- **Política RLS de DELETE**:
  - Permitir `DELETE` em `procedimento_versoes` apenas para `leader/admin` e `status = 'draft'`. Bloquear todos os demais status.
- **Política RLS de UPDATE (Draft)**:
  - Permitir edição de conteúdo em `draft`, mas **bloquear explicitamente** a alteração manual para `status = 'published'` via API.
- **RPC `publish_procedure_version`**:
  - **Segurança**: Exigir `auth.uid()`, validar role `leader/admin` via `has_role`, `SECURITY DEFINER`, `SET search_path = public`, `REVOKE EXECUTE FROM PUBLIC/anon`, `GRANT EXECUTE TO authenticated`.
  - **Locking**: `SELECT ... FOR UPDATE` no procedimento lógico para evitar concorrência.
  - **Validação de Árvore (Backend)**: Validar estrutura JSON, `startNodeId`, existência de nós, pelo menos um `result` com `instruction`, e integridade de `answers` e `nextNodeId`.
  - **Sucessão Cronológica**: Validar `v2.vigencia_inicio > v1.vigencia_inicio` e encerrar `v1` (`vigencia_fim = v2.vigencia_inicio - 1 dia`).
  - **Auditoria**: Preencher `published_at`, `publicado_por_id` e auditoria usando `now()` e `auth.uid()`.
  - **Transação**: Operação atômica com rollback em caso de erro.
- **Trigger Canônico de Imutabilidade e Status**:
  - **Imutabilidade**: Bloquear `UPDATE` em versões `published`, `suspended` ou `archived`.
  - **Exceção Controlada**: Utilizar variável de configuração de sessão (ex: `SET LOCAL app.internal_mutation = 'true'`) dentro da RPC para permitir que o trigger autorize a alteração de `vigencia_fim` e auditoria apenas durante o fluxo de sucessão. Bloquear qualquer `UPDATE` direto do cliente.
  - **Transições**: Validar `draft -> published` (via RPC), `published -> suspended/archived`, `suspended -> archived`.
  - **Auditoria de Status**: Trigger preenche `status_updated_at` e `status_alterado_por_id`.

### Consolidação de Triggers
- Remover triggers obsoletos: `trg_procedimento_versao_delete`, `trigger_prevent_versao_deletion`, `trg_procedimento_versao_immutability`, `trigger_enforce_versao_immutability`.

## 2. Interface (React)

- **`leader-procedures.tsx`**:
  - Usar `supabase.rpc('publish_procedure_version')`.
  - Ao suspender/arquivar, enviar apenas o novo `status`.
  - Na ação "Criar Nova Versão": Copiar metadados e árvore, `versao = anterior + 1`, `substitui_versao_id = anterior.id`, `status = draft`.
  - **Vigência**: Inicializar com valor da anterior mas manter editável; remover `new Date()` automático.
- **`ProcedureForm.tsx`**: Garantir que `vigencia_inicio` seja editável em rascunhos.

## 3. Zona Protegida (NÃO ALTERAR)
- `src/lib/sync/**`, `src/lib/offline-auth.ts`, `src/lib/sync/session-backup.ts`, `src/lib/db/local-db.ts`, `src/lib/db/repos.ts`, `src/lib/db/catalogs.ts`, `src/components/layout/SyncIndicator.tsx`, `NetworkService`, stores/diagnósticos/alertas de conectividade, autenticação atual, `outbox`, `capacitor.config.ts`, `mobile/src/route-tree.ts`, `mobile/**`, `android/**`, Home da equipe, fluxos de expediente, serviços e tabelas operacionais existentes (e suas RLS).

## 4. Testes Obrigatórios
42. leader consegue excluir draft.
43. admin consegue excluir draft.
44. equipe não consegue excluir draft.
45. published não pode ser excluído.
46. suspended não pode ser excluído.
47. archived não pode ser excluído.
48. criação de v2 não altera a v1.
49. v2 nasce como draft.
50. v2 possui substitui_versao_id correto.
51. data de vigência da v2 pode ser revisada antes da publicação.
52. publicação de v2 encerra corretamente vigencia_fim da v1.
53. conteúdo operacional da v1 permanece inalterado exceto vigencia_fim/auditoria autorizada.
54. encerramento da v1 + publicação da v2 são atômicos.
55. erro durante sucessão causa rollback completo.
56. duas versões published simultaneamente vigentes continuam impossíveis.
57. UPDATE direto de vigencia_fim de published é bloqueado.
58. cliente não define identidade do publicador.
59. published_at é definido pelo backend.
60. nenhum arquivo da zona protegida é alterado.
61. nenhum mobile/** é alterado.
62. nenhum android/** é alterado.
63. build web conclui sem erro.
64. UPDATE direto draft -> published via API/RLS é rejeitado.
65. publicação via publish_procedure_version funciona.
66. duas publicações concorrentes do mesmo procedimento não geram duas versões vigentes.
67. status_alterado_por_id é definido pelo backend.
68. status_updated_at é definido pelo backend.
69. cliente envia apenas status ao suspender/arquivar.
70. publicação com árvore estruturalmente inválida é rejeitada pelo backend.
71. published -> suspended continua funcional.
72. published -> archived continua funcional.
73. suspended -> archived continua funcional.
74. draft -> suspended é rejeitado.
75. draft -> archived é rejeitado.
76. nenhum trigger duplicado de mesma responsabilidade permanece no banco.
77. pergunta sem respostas é rejeitada pelo backend.
78. nextNodeId inexistente é rejeitado pelo backend.
