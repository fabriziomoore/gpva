
# GPVA — Arquitetura Proposta

PWA mobile-first para equipes de campo registrarem serviços e gerarem automaticamente o relatório diário. Stack: TanStack Start + Lovable Cloud (Supabase) + Tailwind + shadcn/ui + Recharts.

## 1. Autenticação (Equipe + Senha, sem e-mail)

Supabase Auth exige e-mail, então usamos um "e-mail sintético" interno, invisível ao usuário:

- Login mostra apenas **Equipe** e **Senha**.
- Internamente: `email = <nome_equipe_normalizado>@gpva.local`.
- Cadastro de nova equipe: usuário digita Equipe + Senha → criamos a conta + registro em `teams`.
- Primeiro acesso após cadastro: tela única pedindo **Supervisor** e **Líder** → grava em `teams` e nunca mais pergunta.
- Alterar senha: `supabase.auth.updateUser({ password })` em Configurações.

Todo dado é isolado por `team_id = auth.uid()` via RLS.

## 2. Banco de Dados (Supabase / Lovable Cloud)

Todas as tabelas têm `team_id uuid references auth.users(id)` + RLS `team_id = auth.uid()`. GRANTs para `authenticated` + `service_role`.

```text
teams                  (id=auth.uid, team_name unique, supervisor, leader, variable_rate numeric default 7.00, onboarded bool)
service_types          (id, team_id, name, is_negotiation bool, sort_order, active)
inviability_reasons    (id, team_id, name, active)
impacts                (id, team_id, name, active)

shifts                 (id, team_id, started_at, ended_at, status[open|closed], report_text)
shift_impacts          (shift_id, impact_id)  -- N:N

services               (id, team_id, shift_id, service_type_id,
                        viable bool,
                        reason_id nullable, registration_number nullable,  -- inviável
                        negotiated_value numeric nullable,                  -- negociação
                        created_at)
```

Cálculos financeiros são derivados em tempo real (sem tabela "histórico financeiro" separada — view/consulta sobre `services` + `teams.variable_rate`). Mais simples e sempre coerente quando o valor da variável muda.

Seed automático no primeiro login: tipos, motivos e impactos dos exemplos do brief, todos editáveis.

## 3. Estrutura de Rotas (TanStack Start)

```text
/auth                       Login + Cadastro de equipe (público)
/_authenticated/
  onboarding                Supervisor + Líder (se !teams.onboarded)
  index                     Home — nome da equipe + "Iniciar Expediente"
  shift                     Expediente ativo: KPIs no topo, lista de serviços, FAB "+ Serviço", "Finalizar"
  shift/$id/report          Relatório gerado (Copiar / WhatsApp / PDF)
  productivity              Painel produtividade (gráficos Recharts)
  variable                  Painel financeiro
  settings/index            Hub
  settings/team             Equipe + senha
  settings/service-types
  settings/reasons
  settings/impacts
  settings/variable         Valor por negociação
```

Layout `_authenticated` com **bottom nav** fixa: Início · Produtividade · Variável · Configurações.

## 4. Fluxo de Cadastro de Serviço (≤ 3 toques)

Bottom sheet em uma única tela com etapas:

1. **Toque 1** — grid grande de Tipos de Serviço.
2. **Toque 2** — Viável / Inviável (botões enormes lado a lado).
   - Negociação pula essa etapa: tipo marcado `is_negotiation=true` abre direto teclado numérico para o valor → salvar.
3. **Toque 3** —
   - Viável: salvo automaticamente no toque 2.
   - Inviável: escolher Motivo (grid) → input Matrícula → salvar.
   - Negociação: confirmar valor → salvar.

KPIs no topo recalculam via `useQuery` invalidado a cada insert.

## 5. Finalizar Expediente

Sheet com chips multi-seleção de Impactos → salva `shift_impacts`, fecha `shifts`, gera `report_text` (string formatada conforme modelo do brief) e navega para `/shift/$id/report` com:

- **Copiar** (Clipboard API)
- **WhatsApp** (`https://wa.me/?text=...`)
- **PDF** (`jspdf` no cliente)

Relatórios passados acessíveis em Produtividade → Histórico.

## 6. Painéis

- **Produtividade**: tabs Dia/Semana/Mês/Ano. Cards (total, viáveis, inviáveis, %), gráfico de linha evolução, barras por tipo, top/menos executados, lista histórica.
- **Variável**: cards Dia/Semana/Mês/Ano (qtde negociações × `variable_rate` + soma de `negotiated_value`), gráfico de linha financeira, histórico. Nunca exibido no relatório.

Recharts para todos os gráficos. Agregação client-side via React Query (volume baixo por equipe).

## 7. Configurações

CRUD simples (lista + sheet de edição) para Tipos, Motivos, Impactos. Soft-delete via `active=false` para preservar histórico. Tela Variável = único input numérico.

## 8. Componentes-chave

```text
components/
  layout/BottomNav.tsx, AppShell.tsx
  shift/KpiBar, ServiceList, AddServiceSheet, FinishShiftSheet
  report/ReportView, ReportActions
  charts/EvolutionLine, ByTypeBar, PercentDonut
  settings/CrudList, CrudItemSheet
  ui/* (shadcn existentes)
lib/
  auth.ts (signIn/signUp com e-mail sintético)
  report.ts (formatReport(shift))
  metrics.ts (agregações dia/semana/mês/ano)
  seed.ts (defaults no primeiro login)
hooks/
  useTeam, useActiveShift, useShiftServices, useMetrics
```

## 9. PWA

Manifest-only (instalável + ícone na home). Sem service worker — dados são cloud-only e funcionam apenas online, alinhado ao requisito de "sincronização automática". Sem modo offline (não foi pedido).

## 10. Regras de Negócio

- Apenas 1 expediente `open` por equipe simultaneamente; "Iniciar" reaproveita se existir.
- `variable_estimated = count(negotiations) * teams.variable_rate` (sempre dinâmico).
- `total_negotiated = sum(negotiated_value)`.
- Tipo "Negociação" identificado por flag `is_negotiation`, não por nome (permite renomear).
- Inviável exige `reason_id` + `registration_number` (validado client + RLS check).
- Relatório armazenado como texto final em `shifts.report_text` para imutabilidade histórica.

## 11. Detalhes Técnicos

- Lovable Cloud habilitado → tabelas + RLS + GRANTs em uma migration.
- Server functions (`createServerFn` + `requireSupabaseAuth`) apenas para o seed inicial e cadastro de equipe (cria auth user com e-mail sintético usando `supabaseAdmin`). Demais leituras/escritas usam o cliente browser sob RLS.
- React Query para cache/invalidations.
- Tailwind tokens semânticos em `src/styles.css` (tema escuro de alto contraste, primário energético tipo laranja/âmbar industrial — confirmo na implementação se preferir outra paleta).

---

**Aprovar este plano?** Após o OK eu habilito o Lovable Cloud, crio as migrations, telas e fluxos descritos.
