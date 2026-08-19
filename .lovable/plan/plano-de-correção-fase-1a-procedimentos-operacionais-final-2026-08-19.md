# Plano de Correção: Fase 1A - Procedimentos Operacionais (Final)

Este plano detalha as especificações técnicas e de segurança para a biblioteca de procedimentos, com foco em imutabilidade, versionamento controlado e integridade no backend.

## 🏗️ Arquitetura e Mudanças

### Arquivos que serão Alterados
- `src/lib/procedures/tree-validation.ts`: Implementação da validação completa (DFS).
- `src/components/procedures/ProcedureForm.tsx`: Correção do submit, novos metadados e lógica de imutabilidade na UI.
- `src/routes/_authenticated/leader-procedures.tsx`: Fluxos de gestão, transições de status e lógica de "Criar Nova Versão".

### Arquivos que serão Criados
- `supabase/migrations/20260820_fix_procedures_final.sql`: Migration corretiva com triggers, RPC e constraints.

### 🗄️ Backend e Integridade (Migration)
1. **RPC Atômico `create_procedure_with_version`**:
   - Cria `procedimentos` + primeira versão `draft` na mesma transação.
   - Restrito a roles `leader` ou `admin` (sistema atual).
   - Sem `service_role`, com `search_path` seguro.
2. **Nova Versão (Operação de INSERT)**:
   - Ação "Criar nova versão" executa obrigatoriamente um `INSERT`.
   - v1 `published` permanece preservada. Nova v2 nasce como `draft`.
   - `versao = anterior + 1`, `substitui_versao_id = id_anterior`.
   - Copia: título, categoria, descrição, setor, fonte, árvore e vigência inicial.
   - **Proibido** usar `UPDATE` para versionar registros publicados.
3. **Imutabilidade Pós-Draft**:
   - Trigger impede alteração de: `procedimento_id`, `versao`, `substitui_versao_id`, `titulo`, `categoria`, `descricao`, `setor`, `vigencia_inicio`, `vigencia_fim`, `fonte`, `arvore_decisao`, `criado_por_id`, `published_at`, `publicado_por_id`.
   - Transição de status (`suspended`/`archived`) altera **apenas** campos de status e auditoria.
4. **Segurança e Deletes**:
   - `ON DELETE RESTRICT` na FK de `procedimento_id`.
   - Bloqueio de DELETE físico para versões não-`draft`.
   - `substitui_versao_id` validado para pertencer ao mesmo procedimento.
5. **Vigências Sobrepostas**:
   - Backend impede a publicação de duas versões do mesmo procedimento com intervalos de vigência simultâneos.

## 🛡️ Zona Protegida (NÃO ALTERAR)
**Arquivos da Zona Protegida Alterados = NENHUM.**
- `src/lib/sync/**`, `src/lib/offline-auth.ts`, `src/lib/sync/session-backup.ts`, `src/lib/db/local-db.ts`, `src/lib/db/repos.ts`, `src/lib/db/catalogs.ts`.
- `NetworkService`, `src/components/layout/SyncIndicator.tsx`, diagnósticos de conectividade, alertas online/offline.
- Autenticação atual, outbox, `capacitor.config.ts`.
- **Fluxo Mobile/Android Congelado**: `mobile/src/route-tree.ts`, `mobile/**`, `android/**`. Rota `/leader-procedures` NÃO será registrada no mobile.

## 🧪 41 Testes Individuais Obrigatórios
1. Árvore válida permite salvar rascunho.
2. Árvore inválida impede salvar/publicar.
3. Ciclo A→B→A é rejeitado na validação.
4. `nextNodeId` inexistente é rejeitado.
5. Caminho sem resultado é rejeitado.
6. Categoria é persistida corretamente.
7. Setor é persistido corretamente.
8. Fonte é persistida corretamente.
9. Botão Gerenciar funciona.
10. `draft` pode ser editado.
11. `draft` pode ser publicado.
12. Publicação exige confirmação/revisão na UI.
13. Versão publicada não permite editar conteúdo.
14. "Criar nova versão" preserva versão anterior integralmente.
15. Nova versão possui número incrementado (`versao + 1`).
16. `substitui_versao_id` aponta para a versão anterior.
17. Autorreferência em `substitui_versao_id` é rejeitada no banco.
18. Substituição entre procedimentos diferentes é rejeitada no banco.
19. Transição `published → suspended` funciona.
20. Transição `published → archived` funciona.
21. Transição `suspended → archived` funciona.
22. Transição `suspended → published` é rejeitada.
23. Transição `archived → published` é rejeitada.
24. `vigencia_fim` publicada não pode ser alterada diretamente.
25. DELETE de versão publicada continua bloqueado.
26. Exclusão do procedimento pai não remove histórico (`RESTRICT`).
27. Líder acessa gestão.
28. Admin acessa gestão.
29. Equipe não acessa gestão.
30. RLS continua habilitada.
31. Login de equipe online permanece funcional.
32. Login offline permanece funcional.
33. Dexie permanece sem alterações.
34. Outbox permanece sem alterações.
35. `NetworkService` permanece sem alterações.
36. `SyncIndicator` permanece sem alterações.
37. Alertas online/offline permanecem sem alterações.
38. Nenhum arquivo de `mobile/**` alterado.
39. Nenhum arquivo de `android/**` alterado.
40. Build web conclui sem erro.
41. **Tentativa de publicar versão com vigência sobreposta é rejeitada pelo backend.**
