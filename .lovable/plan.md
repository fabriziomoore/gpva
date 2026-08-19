# Plano de Correção: Fase 1A - Procedimentos Operacionais (Revisado)

Este plano detalha as correções obrigatórias para a biblioteca de procedimentos, focando em integridade de dados, validação de árvores e fluxos de versionamento no backend.

## 🏗️ Arquitetura e Mudanças

### Arquivos que serão Alterados
- `src/lib/procedures/tree-validation.ts`: Implementação da validação completa (DFS).
- `src/components/procedures/ProcedureForm.tsx`: Correção do submit, novos metadados e lógica de UI para draft/published.
- `src/routes/_authenticated/leader-procedures.tsx`: Fluxos de gestão, transições de status e nova versão.
- `src/components/procedures/DecisionTreeEditor.tsx`: (Se necessário para exibir erros de validação específicos).

### Arquivos que serão Criados
- `supabase/migrations/20260820_fix_procedures_integrity.sql`: Migration corretiva com triggers, RPC e constraints.

### 🗄️ Backend e Integridade (Migration Corretiva)
1. **RPC Atômico `create_procedure_with_version`**:
   - Cria `procedimentos` e `procedimento_versoes` na mesma transação.
   - Valida `auth.uid()` via `has_role(auth.uid(), 'leader')` ou `'admin'`.
   - Sem `service_role`, respeitando o `search_path`.
2. **Restrições de Deletar**:
   - Alterar `ON DELETE CASCADE` para `ON DELETE RESTRICT` na FK de `procedimento_id`.
   - Impedir DELETE físico de qualquer versão que não seja `draft`.
3. **Imutabilidade**:
   - Reforçar trigger para impedir alteração de conteúdo (título, árvore, etc.) em versões `published`, `suspended` ou `archived`.
4. **Versionamento e substitui_versao_id**:
   - Constraint: `substitui_versao_id != id`.
   - Trigger: Validar que `substitui_versao_id` pertence ao mesmo `procedimento_id`.
   - Impedir sobreposição de vigência: Duas versões `published` do mesmo procedimento não podem ter datas vigentes simultâneas.
5. **Transições de Status**:
   - Permitidos: `draft → published`, `published → suspended`, `published → archived`, `suspended → archived`.
   - Rejeitados: `suspended → published`, `archived → *`, `published → draft`.

## 🛡️ Zona Protegida (NÃO ALTERAR)
**Arquivos da Zona Protegida Alterados = NENHUM.**
- `src/lib/sync/**`, `src/lib/offline-auth.ts`, `src/lib/sync/session-backup.ts`, `src/lib/db/local-db.ts`, `src/lib/db/repos.ts`, `src/lib/db/catalogs.ts`.
- `NetworkService`, `src/components/layout/SyncIndicator.tsx`, diagnósticos de conectividade, alertas online/offline.
- Autenticação atual, outbox, `capacitor.config.ts`, `mobile/**`, `android/**`.
- Fluxo iniciar/continuar expediente e tabelas operacionais existentes (RLS mantida).

## 🧪 40 Testes Individuais Obrigatórios
1. Árvore válida permite salvar rascunho.
2. Árvore inválida impede salvar/publicar.
3. Ciclo A→B→A é rejeitado na validação.
4. `nextNodeId` inexistente é rejeitado.
5. Caminho sem resultado é rejeitado.
6. Categoria é persistida corretamente a partir do formulário.
7. Setor é persistido corretamente.
8. Fonte é persistida corretamente.
9. Botão Gerenciar funciona (abre opções de rascunho/publicação).
10. `draft` pode ser editado.
11. `draft` pode ser publicado.
12. Publicação exige confirmação/revisão na UI.
13. Versão publicada não permite editar conteúdo (título, árvore, etc.).
14. "Criar nova versão" preserva versão anterior integralmente.
15. Nova versão possui número incrementado (`versao + 1`).
16. `substitui_versao_id` aponta corretamente para a versão anterior.
17. Autorreferência em `substitui_versao_id` é rejeitada no banco.
18. Substituição entre procedimentos diferentes é rejeitada no banco.
19. Transição `published → suspended` funciona.
20. Transição `published → archived` funciona.
21. Transição `suspended → archived` funciona.
22. Transição `suspended → published` é rejeitada.
23. Transição `archived → published` é rejeitada.
24. `vigencia_fim` publicada não pode ser alterada diretamente via UPDATE.
25. DELETE de versão publicada/suspensa/arquivada é bloqueado.
26. Exclusão do procedimento pai (identity) é bloqueada se houver versões (`RESTRICT`).
27. Líder acessa gestão de procedimentos.
28. Admin acessa gestão de procedimentos.
29. Equipe não acessa gestão (negado via hook e RLS).
30. RLS continua habilitada em todas as tabelas.
31. Login de equipe online permanece funcional.
32. Login offline permanece funcional.
33. Dexie permanece sem alterações.
34. Outbox permanece sem alterações.
35. `NetworkService` permanece sem alterações.
36. `SyncIndicator` permanece sem alterações.
37. Alertas online/offline permanecem sem alterações.
38. Nenhum arquivo de `mobile/**` alterado.
39. Nenhum arquivo de `android/**` alterado.
40. Build web conclui sem erros.

**Nota:** Nenhuma funcionalidade da Fase 2 ou Assistente de IA será implementada agora.
