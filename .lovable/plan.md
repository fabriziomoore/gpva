# Plano de Correção Obrigatória - Fase 1A (Procedimentos)

Este plano aborda as correções críticas identificadas na auditoria pós-implementação da Fase 1A, focando em segurança, integridade de dados e conformidade com as regras operacionais.

## Alterações Propostas

### 1. Banco de Dados (PostgreSQL)
- **RLS em `procedimento_versoes`**:
    - Adicionar policy `FOR DELETE` permitindo exclusão apenas se `status = 'draft'` e o usuário for `leader` ou `admin`.
- **RPC de Publicação Segura (`publish_procedure_version`)**:
    - Implementar função transacional que valida e publica uma versão.
    - Se houver `substitui_versao_id`, encerra a vigência da versão anterior (`vigencia_fim` = `nova_vigencia_inicio - 1 dia`).
    - Preenche `published_at`, `publicado_por_id` e auditoria automaticamente no backend.
    - Garante que NENHUM outro campo operacional da versão anterior seja alterado.
- **Consolidação de Triggers**:
    - Remover triggers duplicados (`trg_procedimento_versao_delete`, `trigger_prevent_versao_deletion`, `trg_procedimento_versao_immutability`, `trigger_enforce_versao_immutability`).
    - Criar implementações canônicas para Imutabilidade (bloqueia UPDATE em versões não-draft) e Proteção contra DELETE (bloqueia DELETE em versões não-draft).
- **Triggers de Integridade**:
    - Manter/Refinar `trigger_check_vigencia_overlap` e `trigger_validate_versao_substituicao`.

### 2. Frontend (React / TanStack Start)
- **`leader-procedures.tsx`**:
    - Substituir chamadas diretas de `.update({ status: 'published' })` pela chamada da nova RPC `publish_procedure_version`.
    - Garantir que o cliente não envie campos de auditoria (`published_at`, etc).
    - Implementar ação de "Excluir Rascunho" integrada à nova policy RLS.
    - Na ação "Criar Nova Versão", remover a definição automática de `vigencia_inicio` como hoje; permitir que o líder revise e edite antes de salvar/publicar.
- **`ProcedureForm.tsx`**:
    - Ajustar inicialização de datas para permitir edição total em rascunhos.
    - Assegurar que metadados sejam copiados corretamente ao criar nova versão.

### 3. Zona Protegida (NÃO ALTERAR)
- `src/lib/sync/**`, `src/lib/offline-auth.ts`, `mobile/**`, `android/**`, fluxos de expediente, home da equipe, tabelas operacionais e suas RLS.

## Detalhes Técnicos

### RPC `publish_procedure_version`
```sql
CREATE OR REPLACE FUNCTION public.publish_procedure_version(p_versao_id UUID)
RETURNS VOID AS $$
DECLARE
  v_proc_id UUID;
  v_subst_id UUID;
  v_nova_inicio DATE;
  v_role app_role;
BEGIN
  -- 1. Verificar Auth e Role (Leader/Admin)
  -- 2. Validar se a versão é rascunho
  -- 3. Se tiver substitui_versao_id:
  --    a. Validar consistência (mesmo procedimento, data cronológica)
  --    b. Update controlado na v1: vigencia_fim = v2.vigencia_inicio - INTERVAL '1 day'
  -- 4. Update v2: status = 'published', published_at = now(), publicado_por_id = auth.uid()
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

## Testes Obrigatórios
42-47. Validação de DELETE por Role e Status.
48-51. Comportamento de criação de V2 (draft, substitui_versao_id, vigência editável).
52-55. Atomicidade da publicação e encerramento da V1.
56-59. Bloqueio de sobreposição e auditoria no backend.
60-63. Integridade do build e zona protegida.

---
**NÃO refatorar áreas fora do escopo. Foco total em correção e segurança.**
