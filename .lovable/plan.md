## Reordenação de catálogos por equipe (sincronizada na nuvem)

Permitir que cada equipe defina a ordem dos itens exibidos durante o expediente para: Tipos de serviço, Motivos de inviabilidade, Complementos e Impactos. Reordenação feita direto nas telas de seleção, com pressionar e arrastar. Preferências salvas no banco por equipe e sincronizadas offline.

### 1. Banco de dados

Nova tabela `catalog_order` guardando a ordem preferida de cada equipe por catálogo:

- `team_id` (uuid, ref `equipes.id`)
- `catalog` (text: `tipos_servico` | `motivos_inviabilidade` | `complementos_servico` | `impactos`)
- `item_ids` (uuid[]) — ordem escolhida
- PK composta (`team_id`, `catalog`)
- RLS: cada equipe lê/escreve apenas suas linhas (`auth.uid() = team_id`); admin (service_role) acesso total
- GRANTs para `authenticated` e `service_role`
- Trigger `updated_at`

### 2. Sync offline

- Adicionar `catalog_orders` no Dexie (`src/lib/db/local-db.ts`) com chave `[team_id, catalog]`
- Cachear localmente ao carregar; escrever otimista + outbox `upsert` em `catalog_order` (mesmo padrão de `equipes`)
- Hook `useCatalogOrder(catalog)` combina catálogo global + ordem local da equipe

### 3. Ordenação aplicada

Em `src/lib/db/catalogs.ts`, novo helper `applyOrder(items, orderIds)`:
- Itens presentes em `orderIds` aparecem primeiro na ordem definida
- Itens novos (ainda não ordenados) aparecem no fim em ordem alfabética

`useTiposServicoCached`, `useMotivosCached`, `useComplementosCached`, `useImpactsCached` retornam já ordenados por equipe.

### 4. UI — arrastar direto nas telas

Componente `ReorderableGrid` reutilizável (grid 2 col para chips) usando `@dnd-kit/core` + `@dnd-kit/sortable` (leve, touch nativo).

Interação:
- Botão "Reorganizar" (ícone `ArrowUpDown`) no cabeçalho de cada sheet
- Ao ativar: chips ganham handle visual, arrastar para reposicionar; ao soltar, salva a nova ordem otimista
- Botão "Concluído" sai do modo

Locais:
- `AddServiceSheet.tsx` — tipos de serviço, motivos (etapa inviável), complementos
- `FinishShiftSheet.tsx` — impactos

### 5. Arquivos afetados

**Novos**
- `src/components/shift/ReorderableGrid.tsx`
- `src/hooks/use-catalog-order.ts`
- Migration criando `catalog_order`

**Modificados**
- `src/lib/db/local-db.ts` — nova tabela Dexie + bump de versão
- `src/lib/db/catalogs.ts` — aplicar ordem nos hooks
- `src/lib/db/repos.ts` — `repoSaveCatalogOrder`
- `src/lib/sync/engine.ts` — suporte à tabela `catalog_order` no outbox
- `src/components/shift/AddServiceSheet.tsx`
- `src/components/shift/FinishShiftSheet.tsx`
- `package.json` — `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`

### Notas
- Como `equipes.id = auth.uid()`, RLS por `team_id = auth.uid()` funciona direto
- Escrita otimista: UI muda na hora; sync empurra depois (mantém offline)
- Itens excluídos pelo admin somem naturalmente (helper filtra pelos ids existentes)