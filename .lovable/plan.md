# CORREÇÃO CIRÚRGICA — PUBLICAÇÃO E SUCESSÃO ATÔMICA DE PROCEDIMENTOS (v3)

## OBJETIVO
Refinar e detalhar a arquitetura de publicação/sucessão de `procedimento_versoes` para garantir atomicidade, integridade temporal e imutabilidade histórica rigorosa, integrando todas as salvaguardas e requisitos do plano mestre.

## MUDANÇAS TÉCNICAS

### 1. RPC public.publish_procedure_version(...)
- **Comparações Null-Safe:** EXCLUSIVAMENTE `IS NOT DISTINCT FROM` para `vigencia_inicio` e `substitui_versao_id`. Proibido `!=`, `<>` ou COALESCE com sentinelas.
- **Locking & Serialização:** Lock exclusivo da linha pai em `public.procedimentos` (`FOR UPDATE`). Predecessor também bloqueado (`FOR UPDATE`).
- **Gestão de Predecessor:**
    - Condições literais: `predecessor.id IS DISTINCT FROM v_draft.id`, `predecessor.procedimento_id = v_draft.procedimento_id`, `predecessor.status = 'published'`, `v_draft.vigencia_inicio > predecessor.vigencia_inicio`.
    - Intervalo: (`predecessor.vigencia_fim IS NULL OR predecessor.vigencia_fim > v_draft.vigencia_inicio`).
    - Abortar integralmente em qualquer falha.
    - Fechamento: UPDATE exclusivo de `vigencia_fim = v_draft.vigencia_inicio`. Nenhum outro campo muda.
- **Publicação do Draft:** UPDATE restrito a 5 campos: `status`, `published_at`, `publicado_por_id`, `status_updated_at`, `status_alterado_por_id`.
    - **15 campos imutáveis:** `id`, `procedimento_id`, `versao`, `substitui_versao_id`, `titulo`, `categoria`, `descricao`, `setor`, `vigencia_inicio`, `vigencia_fim`, `fonte`, `arvore_decisao`, `criado_por_id`, `created_at`, `updated_at`.

### 2. Trigger de Integridade (check_procedimento_versao_integrity)
- Manter integralmente as regras aprovadas:
    - INSERT valida arvore; draft -> draft permitido; arvore muda em draft revalida; published -> suspended/archived permitido; suspended -> archived permitido; archived terminal.
- Adicionar exceções formatadas:
    - **CASO A (Histórico):** `published -> published` permitido SOMENTE se `vigencia_fim` for a única alteração (`DISTINCT`, `NOT NULL`, `> OLD.vigencia_inicio`).
    - **CASO B (Publicação):** `draft -> published` validando os 5 metadados e re-validando a árvore.
- **Proibições:** `current_user`, `internal_proc_executor`, GUCs, `SET ROLE`, `RECORD`, `!=`, `<>`.

### 3. RLS Histórica
- Policy "Líderes e admins atualizam status histórico":
    - **USING:** `leader/admin` AND `OLD.status IN ('published', 'suspended')`.
    - **WITH CHECK:** Permitir SOMENTE `suspended` ou `archived`. Bloquear `published` (usuário não publica/fecha vigência diretamente).
- Exatamente 6 policies no total.

### 4. Check de Sobreposição (check_vigencia_overlap)
- Manter `SECURITY INVOKER` e `search_path = public`. Usar `IS DISTINCT FROM`.
- **Remover OVERLAPS.** Lógica explícita `[start, end)`.
- Proibido timestamptz, timezones, `INTERVAL '1 day'` ou subtração de dias.

### 5. OBJETOS CONGELADOS (NÃO ALTERAR)
- `validate_procedure_tree`, `validate_versao_substituicao`, `prevent_procedimento_versao_historical_delete`, `create_procedure_with_version`.
- Tabelas, colunas, constraints, FKs, índices, enum.
- Outras 5 policies RLS, roles, memberships, grants.
- Frontend, mobile, android, auth, offline, sync, dados existentes.
- Proibido criar helper, schema, role, GUC ou RPC paralela.

## PROTOCOLO DE EXECUÇÃO
- EXATAMENTE UMA nova migration. Proibido SQL manual de escrita/DDL avulso.
- Após migration: somente SELECT/READ-ONLY.

## TESTES DE ACEITE (22 NOMINAIS)
1. Não-auth falha; 2. Sem role leader/admin falha; 3. Draft inexistente falha; 4. Versão não-draft falha; 5. Vigencia_inicio divergente falha; 6. Substitui_versao divergente falha; 7. Árvore inválida falha; 8. Predecessor outro proc falha; 9. Predecessor não-published falha; 10. Temporal incompatível falha; 11. Conflito vigência falha; 12. Sem predecessor + conflito falha; 13. Publicação válida s/ pred funciona; 14. Publicação válida c/ pred funciona atomicamente; 15. Pred termina em successor.inicio; 16. S/ subtração 1 dia; 17. Draft->Published direto bloqueado; 18. Published->Published direto bloqueado; 19. Pub->Suspended ok; 20. Pub->Archived ok; 21. Susp->Archived ok; 22. Concorrência serializada por lock do pai.

## VALIDAÇÃO PÓS-EXECUÇÃO (READ-ONLY)
- RPC: `SECURITY DEFINER`, `search_path = public`, sem `!=`, `<>`, sentinelas ou GUCs. Contém locks FOR UPDATE.
- Trigger/Overlap: `SECURITY INVOKER`, `VOLATILE` (integrity), sem `OVERLAPS`.
- RLS: 6 policies, histórica sem `published` no WITH CHECK.
- Objetos congelados e migration única confirmados.
