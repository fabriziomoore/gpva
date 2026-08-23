# CORREÇÃO CIRÚRGICA — PUBLICAÇÃO E SUCESSÃO ATÔMICA DE PROCEDIMENTOS (v2)

## OBJETIVO
Refinar o plano de publicação/sucessão de `procedimento_versoes` incorporando requisitos críticos de segurança, atomicidade e integridade temporal estrita, conforme o plano mestre.

## MUDANÇAS TÉCNICAS

### 1. RPC public.publish_procedure_version(...)
- **Comparações Null-Safe:** Usar EXCLUSIVAMENTE `IS NOT DISTINCT FROM` para `vigencia_inicio` e `substitui_versao_id`. Proibido `!=`, `<>` ou COALESCE com sentinelas.
- **Gestão de Predecessor:**
    - Carregamento via `SELECT ... FOR UPDATE`.
    - Validações: Existência, ID distinto, mesmo `procedimento_id`, status `published`, cronologia válida (`sucessor.inicio > predecessor.inicio`) e intervalo aberto/compatível.
    - Fechamento: UPDATE exclusivo de `vigencia_fim = sucessor.vigencia_inicio`.
- **Sem Predecessor:** Verificar sobreposição temporal no mesmo procedimento usando semântica `[start, end)`.
- **Publicação do Draft:** UPDATE restrito a 5 campos: `status`, `published_at`, `publicado_por_id`, `status_updated_at`, `status_alterado_por_id`. Todos os outros 15 campos devem permanecer idênticos.

### 2. Trigger de Integridade (check_procedimento_versao_integrity)
- Manter `SECURITY INVOKER` e `VOLATILE`.
- **CASO A (Histórico):** Permitir `published -> published` SOMENTE se `vigencia_fim` for a única alteração, for `DISTINCT`, não-nula e `> vigencia_inicio`.
- **CASO B (Publicação):** Permitir `draft -> published` validando os 5 metadados de publicação e re-validando a árvore.
- **Proibições:** `current_user`, `internal_proc_executor`, GUCs, `SET ROLE`, `RECORD`, `!=`, `<>`.

### 3. RLS Histórica
- Policy "Líderes e admins atualizam status histórico":
    - **USING:** `leader/admin` AND `OLD.status IN ('published', 'suspended')`.
    - **WITH CHECK:** Permitir SOMENTE `suspended` ou `archived`. Bloquear explicitamente `published` para mutações diretas.
- Manter exatamente 6 policies no total.

### 4. Check de Sobreposição (check_vigencia_overlap)
- Manter `SECURITY INVOKER` e `search_path = public`.
- Usar `IS DISTINCT FROM` para o ID.
- **Remover OVERLAPS.** Implementar lógica `NEW.start < existing.end AND existing.start < NEW.end` com COALESCE para `9999-12-31`.
- Regra obrigatória `[start, end)`. Proibido timestamptz, timezones ou `INTERVAL '1 day'`.

## PROTOCOLO DE EXECUÇÃO
- Criar exatamente UMA migration.
- Proibido SQL manual de escrita/DDL antes ou depois.
- Apenas SELECTs para validação.
- Não alterar objetos congelados (tabelas, enums, FKs, indices, etc.).

## TESTES DE ACEITE (Rollback-safe)
1. Falha em chamadas não-auth ou sem role leader/admin.
2. Falha se draft inexistente ou dados (`vigencia_inicio`, `substitui_versao`) divergentes.
3. Falha em árvore inválida ou predecessor incompatível (outro proc, status errado, data errada).
4. Falha em conflitos de vigência (regra `[start, end)`).
5. Sucesso atômico: Fechamento exato do predecessor e publicação do sucessor.
6. Bloqueio RLS/Trigger para mutações diretas não autorizadas.
