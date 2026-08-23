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

## INVARIANTES OBRIGATÓRIOS DA RPC — NÃO OMITIR NA EXECUÇÃO

A função canônica permanece exatamente:
`public.publish_procedure_version(p_versao_id uuid, p_vigencia_inicio date, p_substitui_versao_id uuid DEFAULT NULL)`

Manter:
- Owner atual;
- SECURITY DEFINER;
- SET search_path = public;
- Nenhuma RPC paralela.

### AUTENTICAÇÃO E AUTORIZAÇÃO
Executar: `v_user_id := auth.uid();`. Se `v_user_id IS NULL`: ABORTAR.
Autorizar SOMENTE se: `public.has_role(v_user_id, 'leader') OR public.has_role(v_user_id, 'admin')`. Caso contrário: ABORTAR.
Não criar mecanismo de autenticação ou autorização paralelo.

### ORDEM DE LOCK E RELEITURA
1. Obter `procedimento_id` correspondente a `p_versao_id`.
2. Se não existir: ABORTAR com versão não encontrada.
3. Bloquear a linha pai: `SELECT ... FROM public.procedimentos WHERE id = v_proc_id FOR UPDATE;`.
4. SOMENTE DEPOIS do lock do pai, reler integralmente o draft em `procedimento_versoes`.
Todas as decisões críticas seguintes devem usar essa releitura pós-lock.

### STATUS
Exigir: `v_draft.status = 'draft'`. Qualquer outro status: ABORTAR.

### SOURCE OF TRUTH — VIGÊNCIA E SUCESSÃO
- Vigência: `v_draft.vigencia_inicio IS NOT DISTINCT FROM p_vigencia_inicio`. A RPC NÃO pode alterar `vigencia_inicio`.
- Sucessão: `v_draft.substitui_versao_id IS NOT DISTINCT FROM p_substitui_versao_id`. A RPC NÃO pode alterar `substitui_versao_id`.
Não utilizar UUID sentinela. Não utilizar `!=` ou `<>`.

### VALIDAÇÃO DA ÁRVORE
Antes de qualquer publicação: `IF NOT public.validate_procedure_tree(v_draft.arvore_decisao) THEN RAISE EXCEPTION ...; END IF;`.

### PUBLICAÇÃO SEM PREDECESSOR
Se `v_draft.substitui_versao_id IS NULL`, verificar explicitamente se existe outra versão do mesmo procedimento com status 'published' cujo intervalo `[start, end)` se sobreponha ao draft. Se existir conflito: ABORTAR.

### PUBLICAÇÃO COM PREDECESSOR
Aplicar integralmente as regras de predecessor já presentes no plano v3.

### ATOMICIDADE
Fechamento do predecessor (`vigencia_fim = v_draft.vigencia_inicio`) e publicação do sucessor (`status = 'published'`) devem ocorrer na MESMA execução transacional da RPC. Sem commits intermediários. Qualquer falha deve reverter a operação inteira.

### REGRA TEMPORAL
Continuar obrigatoriamente: `[start, end)` com `vigencia_fim` exclusiva.
NUNCA: `now()`, `timestamp`, timezone conversion, `-1 day` ou `INTERVAL '1 day'` para vigência.

### EXECUÇÃO CONGELADA
Além dos objetos já listados: NÃO alterar `mem://`, memória interna, não usar `SET ROLE`, GUCs, helpers, roles ou schemas paralelos.

### VALIDAÇÃO PÓS-EXECUÇÃO ADICIONAL
Confirmar READ-ONLY: owner preservado, `auth.uid()` presente, checks de role corretos, releitura pós-lock, validação de árvore executada, imutabilidade de `vigencia_inicio`/`substitui_versao_id`, atomicidade garantida.
