# Plano de Correção Final - Fase 1A (Procedimentos)

Este plano consolida as correções de segurança e integridade para a Fase 1A, focando em sucessão controlada, imutabilidade rigorosa e auditoria server-side via mecanismos internos não falsificáveis.

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
- **Função Interna Privada `internal_close_superseded_version`**:
  - Criada em schema privado (ou com restrição de acesso rigorosa).
  - `REVOKE EXECUTE FROM PUBLIC, authenticated, anon`.
  - Apenas altera `vigencia_fim` e campos de auditoria estritamente necessários.
  - Bloqueia alteração de qualquer outro campo (título, árvore, vigencia_inicio, etc).
- **RPC Pública `publish_procedure_version`**:
  - **Segurança**: `SECURITY DEFINER`, `SET search_path = public`, exige `auth.uid()`, valida role `leader/admin`.
  - **Acesso**: `REVOKE EXECUTE FROM PUBLIC, anon`. `GRANT EXECUTE TO authenticated`.
  - **Locking**: `SELECT ... FOR UPDATE` no procedimento para evitar concorrência.
  - **Validação de Árvore**: Backend valida estrutura JSON, `startNodeId`, presença de instruções e integridade de caminhos/respostas.
  - **Sucessão**: Chama a função interna privada para encerrar a v1 e insere/atualiza a v2.
  - **Auditoria**: Backend define `published_at`, `publicado_por_id` e auditoria de status via `now()` e `auth.uid()`.
- **Trigger Canônico de Imutabilidade**:
  - Bloqueia `UPDATE` em versões `published`, `suspended` ou `archived`.
  - **Exceção Segura**: A exceção para `vigencia_fim` só é permitida se detectada através do contexto da função interna privada (usando `current_setting` em conjunto com verificação de privilégios ou call stack se disponível, ou preferencialmente via checagem de função chamadora interna). É proibido confiar apenas em flag de sessão GUC isolada.
  - **Transições**: Valida estados permitidos (`draft -> published` via RPC, etc).

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
79. authenticated não consegue chamar diretamente a função interna de sucessão.
80. leader/admin não conseguem alterar vigencia_fim de published por UPDATE normal.
81. eventual tentativa de definir manualmente contexto/flag de sessão não concede permissão de alterar versão published.
82. publish_procedure_version consegue realizar a sucessão legítima.
83. durante a sucessão, somente vigencia_fim/auditoria autorizada da v1 podem mudar.
