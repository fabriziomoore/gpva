# Plano de Correção: Fase 1A - Procedimentos Operacionais

Este plano visa corrigir os defeitos identificados na implementação da biblioteca de procedimentos, garantindo a integridade dos dados, a validação rigorosa das árvores de decisão e o fluxo completo de gestão de rascunhos e publicações.

## Mudanças Técnicas

### 1. Validação de Árvore de Decisão
- **Arquivo**: `src/lib/procedures/tree-validation.ts`
- Implementar algoritmo de detecção de ciclos e caminhos sem saída usando DFS.
- Garantir que todos os caminhos a partir do `startNodeId` terminem em um nó do tipo `result`.
- Validar unicidade de IDs e presença de campos obrigatórios (título, instrução, labels de respostas).

### 2. Formulário de Procedimentos
- **Arquivo**: `src/components/procedures/ProcedureForm.tsx`
- Corrigir o tratamento do retorno de `validateDecisionTree` para usar o objeto `{ valid, errors }`.
- Adicionar campos de metadados: Categoria (seleção), Setor/Aplicabilidade e Fonte/Origem.
- Implementar exibição amigável de erros de validação da árvore.
- Adicionar botões distintos para "Salvar Rascunho" e "Publicar".

### 3. Gestão e Ciclo de Vida
- **Arquivo**: `src/routes/_authenticated/leader-procedures.tsx`
- Implementar diálogo de confirmação/revisão antes da publicação.
- Adicionar ações: "Criar nova versão", "Suspender", "Arquivar" e "Excluir Rascunho".
- Implementar imutabilidade na interface para versões publicadas (desabilitar campos).

### 4. Integridade e Segurança (Backend/RPC)
- **Nova Migration**: `supabase/migrations/20260819_fix_procedures_integrity.sql`
- Criar função RPC `create_procedure_with_version` para garantir criação atômica (procedimento + primeira versão) sem usar `service_role`.
- Alterar `ON DELETE CASCADE` para `ON DELETE RESTRICT` na FK de `procedimento_id`.
- Adicionar constraints de verificação para `substitui_versao_id` (não ser igual ao ID próprio).
- Proteger `vigencia_fim` contra alterações pós-publicação via trigger existente/reforçada.

### 5. Controle de Acesso
- Atualizar verificações de permissão para incluir usuários com a role `admin` além de `leader`.

## Zonas Protegidas (NÃO ALTERAR)
- `src/lib/sync/**`, `src/lib/offline-auth.ts`, `src/lib/db/local-db.ts`, `src/lib/db/repos.ts`.
- Configurações do Capacitor e pastas `android/`, `mobile/`.
- Tabelas operacionais existentes e fluxos de expediente.

## Plano de Testes
- Validação de ciclos (A->B->A).
- Validação de caminhos sem saída.
- Persistência de novos campos (Categoria, Setor, Fonte).
- Criação de nova versão (incremento e cópia de conteúdo).
- Transições de estado (Draft -> Published -> Suspended/Archived).
- Bloqueio de edição em registros publicados.
- Acesso simultâneo para Líder e Admin.
