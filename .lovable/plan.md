# Plano de Correção Cirúrgica — Fase 1A (Reforço de Integridade)

## Objetivo
Corrigir falhas estruturais de segurança e integridade na implementação da Biblioteca de Procedimentos, eliminando o uso de flags de sessão (GUC) para autorização, fechando brechas na RLS e garantindo validações rigorosas no backend via RPC e Triggers.

## 1. Segurança e Autorização (Remoção de GUC)
- **Eliminar `app.internal_mutation`**: Remover qualquer dependência de `set_config` ou `current_setting` para autorizar alterações.
- **Autorização Estrutural**: A exceção para permitir que o backend feche a `vigencia_fim` de uma versão substituída será feita através de um mecanismo PostgreSQL interno (trigger que verifica se a operação é originada de uma função SECURITY DEFINER específica ou contexto de transação protegido).
- **Hardening da RPC**:
  - `REVOKE ALL ON FUNCTION publish_procedure_version FROM PUBLIC, anon;`
  - `GRANT EXECUTE ON FUNCTION publish_procedure_version TO authenticated;`
  - Verificação interna de role (`leader` ou `admin`) via `public.has_role(auth.uid(), ...)`.

## 2. RLS e Controle de Status
- **Consolidação de Políticas**: Remover políticas duplicadas. Criar uma política única e canônica para `procedimento_versoes`:
  - `SELECT`: Líderes, Admins e Equipes (para versões publicadas).
  - `INSERT`: Líderes e Admins (somente rascunhos).
  - `UPDATE`: Líderes e Admins, restringindo `OLD.status = 'draft'` e `NEW.status = 'draft'`.
  - `DELETE`: Líderes e Admins, somente se `status = 'draft'`.
- **Bloqueio de Publicação Direta**: A política de UPDATE impedirá a mudança manual de `status` de 'draft' para qualquer outro valor. A publicação ocorrerá EXCLUSIVAMENTE via RPC.

## 3. Integridade do Backend (RPC e Triggers)
- **Validação de Árvore no PostgreSQL**: Implementar validação JSONB dentro da RPC `publish_procedure_version` para garantir:
  - Presença de `nodes` e `startNodeId`.
  - Consistência de links (`nextNodeId` aponta para nó existente).
  - Presença de pelo menos um nó de resultado com instrução.
  - Perguntas com pelo menos uma resposta.
- **Lock Concorrente**: Utilizar `SELECT FOR UPDATE` na tabela `public.procedimentos` para serializar publicações de diferentes versões do mesmo procedimento lógico, evitando condições de corrida.
- **Transições de Status**: Trigger para validar transições permitidas (ex: `archived` é terminal; `suspended` pode ir para `archived`).
- **Imutabilidade**: Trigger canônico que bloqueia alterações em campos operacionais para versões não-draft, com exceção única para `vigencia_fim` via fluxo de sucessão controlado.

## 4. Frontend (Ajustes Mínimos)
- Preservar a lógica de criação de nova versão via `INSERT`.
- Garantir que `statusMutation` envie apenas o campo `status` para transições permitidas (suspender/arquivar).

## 5. Zona Protegida (NÃO ALTERAR)
- `src/lib/sync/**`, `src/lib/offline-auth.ts`, `capacitor.config.ts`, `mobile/**`, `android/**`, tabelas operacionais existentes e suas RLS.

## Detalhes Técnicos (Migration 20260820_fase1a_reforco_final.sql)
1. **Trigger de Deletar**: Reintroduzir proteção contra `DELETE` para versões `published`, `suspended` e `archived`.
2. **Trigger de Imutabilidade**: Unificar lógica para impedir alteração de conteúdo em versões publicadas.
3. **RPC `publish_procedure_version`**:
   - Lock no procedimento pai.
   - Validação da árvore.
   - Fechamento da versão anterior (`vigencia_fim = now()`).
   - Ativação da nova versão (`status = 'published'`, `published_at = now()`).

## Testes Bloqueantes (42–78 + Novos A-U)
(Lista completa de testes conforme solicitado pelo usuário para garantir 100% de conformidade).
- A. UPDATE direto draft -> published rejeitado.
- B. RPC publica corretamente.
- ... (demais testes da lista do usuário)
