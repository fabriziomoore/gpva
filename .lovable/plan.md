## Problema

Após a mudança que filtrou os catálogos por `team_id` (para evitar duplicação entre equipes), as listas de **Tipos de Serviço, Motivos, Complementos e Impactos** ficaram vazias em todas as contas.

Causa: as 50 linhas existentes nessas tabelas foram cadastradas antes do filtro e estão com `team_id = NULL` (eram "globais"). O código consulta `.eq("team_id", userId)` e não encontra nada.

## Correção (migração única)

Fazer backfill: para **cada equipe** em `equipes`, clonar as linhas atualmente com `team_id IS NULL` de cada tabela de catálogo, atribuindo o `team_id` correspondente. Depois apagar as linhas órfãs (`team_id IS NULL`) para não sobrarem duplicadas invisíveis.

Tabelas afetadas:
- `tipos_servico` (13 linhas × 6 equipes)
- `motivos_inviabilidade` (20 × 6)
- `complementos_servico` (10 × 6)
- `impactos` (7 × 6)

Passos SQL, dentro de uma migração:

```text
1. INSERT em cada tabela: SELECT gen_random_uuid(), <colunas>, e.id
   FROM <catalogo> c CROSS JOIN equipes e WHERE c.team_id IS NULL;
2. DELETE FROM <catalogo> WHERE team_id IS NULL;
```

Cada equipe passa a ter seu próprio conjunto independente (o que já era a intenção após a correção da duplicação). Nada muda no código do app.

## Verificação

Após aprovar a migração:
- Login em qualquer equipe → abrir "Adicionar serviço" → as listas voltam a aparecer.
- Cada equipe pode editar seus próprios catálogos em Configurações sem afetar as demais.
