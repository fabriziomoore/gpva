# CORREÇÃO CIRÚRGICA — PUBLICAÇÃO E SUCESSÃO ATÔMICA DE PROCEDIMENTOS (v1)

## OBJETIVO
Corrigir a arquitetura de publicação/sucessão de `procedimento_versoes` para garantir atomicidade, integridade temporal e imutabilidade histórica, centralizando a lógica na RPC e reforçando restrições no Trigger e RLS.

## MUDANÇAS TÉCNICAS

### 1. RPC public.publish_procedure_version(...)
- **Autenticação:** Exigir `auth.uid()` e roles `leader`/`admin`.
- **Serialização:** Lock exclusivo no registro pai (`procedimentos`) via `FOR UPDATE`.
- **Validações:**
    - Releitura do draft pós-lock.
    - `draft.status = 'draft'`.
    - `draft.vigencia_inicio` deve ser idêntica a `p_vigencia_inicio`.
    - `draft.substitui_versao_id` deve ser idêntico a `p_substitui_versao_id`.
    - Validação de árvore via `public.validate_procedure_tree`.
- **Sucessão:**
    - Se `substitui_versao_id` presente: Lock do predecessor, validar procedência e status, fechar setando `vigencia_fim = sucessor.vigencia_inicio`.
    - Se ausente: Validar inexistência de conflitos temporais.
- **Publicação:** Atualizar status para `published`, `published_at`, e metadados de auditoria.

### 2. Trigger de Integridade (check_procedimento_versao_integrity)
- Manter `SECURITY INVOKER` e `VOLATILE`.
- Adicionar **CASO A (Fechamento):** Permitir `published -> published` SOMENTE se apenas `vigencia_fim` mudar e for `> vigencia_inicio`.
- Adicionar **CASO B (Publicação):** Permitir `draft -> published` SOMENTE se apenas campos de publicação mudarem e árvore for válida.
- Manter bloqueadas todas as outras transições não autorizadas.

### 3. RLS Histórica
- Alterar policy "Líderes e admins atualizam status histórico".
- **USING:** Manter `leader/admin` e `OLD.status IN ('published', 'suspended')`.
- **WITH CHECK:** Permitir apenas `suspended` ou `archived`. Bloquear `published` para impedir updates diretos de usuários.

### 4. Check de Sobreposição (check_vigencia_overlap)
- Corrigir semântica para `[start, end)`.
- Lógica: `A.start < B.end AND B.start < A.end` (tratando NULL como infinito).
- Usar tipos `DATE` e evitar cálculos de intervalo ou timezones.

## PROTOCOLO DE EXECUÇÃO
- Criar exatamente UMA migration.
- Proibido SQL manual de escrita antes/depois.
- Apenas SELECTs para validação pós-migration.
