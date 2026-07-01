## Objetivo

Transformar os catálogos (Tipos de Serviço, Motivos de Inviabilidade, Complementos, Impactos) em **listas globais únicas**, gerenciadas somente pelo admin. Fim da duplicação por equipe.

## Mudanças no banco (migração única)

Para cada uma das 4 tabelas (`tipos_servico`, `motivos_inviabilidade`, `complementos_servico`, `impactos`):

1. Deduplicar por `name` mantendo a linha mais antiga (a mais antiga vira "canônica").
2. Atualizar referências que apontam para linhas duplicadas para apontar à canônica:
   - `servicos.service_type_id` → tipos canônicos
   - `vinculos_complementos.complement_id` → complementos canônicos
   - `impactos_expediente.impact_id` → impactos canônicos
   - (motivos não têm FK, o app grava o texto)
3. Apagar as linhas duplicadas.
4. Setar `team_id = NULL` em todas as linhas restantes (globais).
5. Alterar coluna: `team_id` passa a ser sempre `NULL` para catálogos (deixa nullable, não obriga).
6. Adicionar índice único em `(name)` onde `active = true` para impedir novas duplicatas.
7. Ajustar RLS: `SELECT` liberado a `authenticated` para todos; `INSERT/UPDATE/DELETE` somente via service role (admin).

## Mudanças no app

- `src/lib/db/catalogs.ts`: remover filtro `.eq("team_id", userId)` das 4 queries; chave de cache volta a ser global (sem `userId`).
- `src/components/settings/CrudList.tsx`: **remover** (equipes não editam mais catálogos).
- `src/routes/_authenticated/settings.tsx`: remover a seção "Cadastros" das configurações da equipe. Mantém apenas Equipe (foto/colaboradores) e Variável (se for do escopo da equipe) — se a taxa variável também deve virar admin-only, confirmar depois; por ora mantém como está.
- `src/routes/admin.tsx`: a aba "Cadastros" continua, mas agora edita a lista única global. `adminAddRow`/`adminDeleteRow`/`adminListRows` em `src/lib/admin.functions.ts` já operam sem `team_id` — só garantir que listem sem duplicar (a dedupe do banco resolve).
- Local cache (Dexie): as chaves antigas com `userId` ficam órfãs; incluir um passo simples de limpeza opcional na próxima leitura (não crítico, expiram).

## Detalhes técnicos

- FKs verificadas antes da migração: `servicos.service_type_id` → `tipos_servico.id`; `vinculos_complementos.complement_id` → `complementos_servico.id`; `impactos_expediente.impact_id` → `impactos.id`.
- Motivos são gravados como texto em `servicos.inviability_reason` (a confirmar durante a implementação lendo o schema); se houver FK, aplicar mesmo tratamento.
- Índice único parcial: `CREATE UNIQUE INDEX ... ON <tabela>(lower(name)) WHERE active = true`.
- Todas as políticas RLS atuais que filtram por `team_id = auth.uid()` nessas 4 tabelas são substituídas por: `SELECT USING (true)` para `authenticated`; sem policies de escrita (bloqueia por padrão; admin usa service role).

## Resultado esperado

- Painel admin: uma única linha por nome (ex.: "Cadastral" aparece 1 vez, não 12).
- Todas as equipes veem o mesmo catálogo — o que o admin cadastra, todas veem imediatamente.
- Equipes não conseguem mais criar/remover itens de catálogo pelas Configurações.
