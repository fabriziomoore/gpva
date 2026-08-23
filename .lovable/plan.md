# Plano de Ação: Microetapa A3 — Carga Normalizada de Supervisor e Líder

Este plano descreve a execução da carga inicial de dados estruturais para o setor "Corte e Religa", seguindo os requisitos rigorosos de integridade e não-vinculação de equipes.

## 🏗️ Backend (Supabase Engineer)

1.  **Criação de Migration Única:** `operacional_normalizado_a3_carga_inicial`.
2.  **Preflight Assertions (Fail-Closed):**
    *   Validar existência do setor `16bbd6c9-0469-40b0-95c8-a2909e7312c1`.
    *   Validar unicidade do UUID do supervisor `8f07f6e1-45d4-4fe1-a43f-6654d6f1f638`.
    *   Validar que não existe supervisor com nome "Ricardo Cunha" (ignore case/trim).
    *   Validar unicidade do UUID do líder estrutural `64df32a7-e4bc-4c17-9dfc-7893474678db`.
    *   Validar que não existe líder estrutural para o `user_id` `6a17b5a5-6716-4af4-b567-743596b1a2c7`.
    *   Validar existência do usuário auth `6a17b5a5-6716-4af4-b567-743596b1a2c7`.
    *   Validar que o usuário possui role `leader` na tabela `user_roles`.
    *   Garantir que NENHUMA equipe possua `supervisor_id` ou `leader_id` preenchido (etapa A4 ainda não iniciada).
3.  **Inserção de Dados:**
    *   `public.supervisores`: Inserir Ricardo Cunha com UUID fixo e `user_id = NULL`.
    *   `public.lideres_estrutura`: Inserir Gabriel Araújo com UUID fixo, vinculado ao supervisor e ao `user_id` fornecido.

## 🔍 Verificação e Qualidade (Code Auditor)

1.  **Pós-check SQL:** Consultas de contagem e verificação de campos para garantir que os dados batem exatamente com o solicitado.
2.  **Integridade Operacional:** Confirmar que `equipes.supervisor_id` e `equipes.leader_id` permanecem nulos.
3.  **Ambiente:** Executar `npx tsc --noEmit` e `npm run build` para garantir zero regressões.

## 🛠️ Detalhes Técnicos

*   **Migration:** `supabase/migrations/20260823235500_operacional_normalizado_a3_carga_inicial.sql`.
*   **Transacionalidade:** A migration roda em bloco atômico. Falha em qualquer assertion aborta toda a carga.
*   **Imutabilidade:** Nenhuma alteração em schema, RLS ou frontend.
