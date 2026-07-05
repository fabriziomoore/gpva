
## Objetivo

Transformar a aba **Produtividade** (hoje mostra apenas o período atual) em um verdadeiro **Painel do Líder**, focado em responder as perguntas que ele leva para a reunião com supervisores/coordenadores:

- Como estamos hoje?
- Estamos melhor ou pior que o período anterior?
- Se mantivermos o ritmo, onde chegamos?
- Quais serviços puxam a produtividade? Onde perdemos (inviáveis)?
- O que compartilhar rapidamente no grupo do WhatsApp?

Tudo agrupado, sem precisar caçar mensagem antiga no WhatsApp.

## O que muda na experiência

### 1. Cabeçalho "Resumo do período"
No topo de cada aba (Dia / Semana / Mês / Ano):
- **Total de serviços** com variação vs período anterior (ex.: `128  ▲ +14% vs semana passada`).
- **Taxa de viabilidade** (%) com variação.
- **Total negociado (R$)** com variação.
- **Variável estimada (R$)** — reforça o que já existe hoje na aba Variável.
- **Média por expediente** (serviços/dia trabalhado) — a métrica que o líder mais usa.

Cada card mostra: valor atual · seta de tendência (▲ ▼ ▬) · % vs período anterior equivalente (semana anterior, mês anterior, etc.).

### 2. Comparativo lado a lado
Card **"Atual vs Anterior"** com barras duplas (período atual x período anterior) para: Total, Viáveis, Inviáveis, Negociações, R$ negociado. Um olhar responde "melhoramos?".

### 3. Projeção (previsão de ritmo)
Card **"Se mantivermos o ritmo"**:
- Semana: projeção até domingo baseada em (média diária corrente × dias restantes).
- Mês: projeção até o último dia útil.
- Ano: projeção até 31/12.
Cada um mostra: projetado, meta anterior (o total do período passado), e diferença — assim o líder já leva "vamos fechar o mês com ~X, +Y% que o mês passado" pronto.

### 4. Ranking e destaques (o "roteiro" da apresentação)
- **Top 5 tipos de serviço** executados (viáveis).
- **Top 5 motivos de inviabilidade** — mostra onde a operação perde tempo/serviço.
- **Impactos mais recorrentes** no período (agrega os impactos dos expedientes fechados).
- **Melhor dia do período** (dia com mais viáveis).
- **Complementos mais usados** — reforça o padrão de execução.

### 5. Histórico enriquecido
A lista de expedientes anteriores hoje só mostra data e link para o relatório. Passa a mostrar em cada linha: total, viáveis, inviáveis, R$ negociado. Assim o líder localiza rapidamente o dia que quer citar.

### 6. Exportar resumo pronto para o WhatsApp / apresentação
Dois botões no topo da tela:
- **Copiar resumo do período** → gera um texto formatado (mesmo padrão dos relatórios de expediente já existentes) com todos os KPIs, comparativo e destaques do período selecionado. Cola direto no grupo.
- **Exportar PDF** → mesma tela em formato retrato, pronto para anexar em e-mail/apresentação.

Reaproveita o helper `src/lib/report.ts` (já usado em `shift_.$id.report.tsx`) estendido com uma função `buildPeriodReport`.

## Detalhes técnicos

Tudo é **frontend / camada de apresentação** — sem mudanças de schema, sem novas tabelas, sem nova policy. Apenas agregações em cima das queries que já existem (`servicos`, `expedientes`, `impactos_expediente`, `complementos_servico`).

- Nova rota mantém `src/routes/_authenticated/productivity.tsx` (não cria rota nova, apenas evolui a existente).
- Introduzir helpers puros em `src/lib/analytics.ts`:
  - `bucketByPeriod(rows, period)` — reaproveitável.
  - `compareWithPrevious(rows, period)` → `{ current, previous, deltaPct }`.
  - `projectPace(rows, period)` → projeção linear pelo ritmo diário corrente.
- Nova função `buildPeriodReport(...)` em `src/lib/report.ts` (mesmo estilo BRL/pad2 já usado).
- Consultas adicionais no `productivity.tsx`:
  - `expedientes` (fechados) — já existe; expandir `select` para incluir contagens agregadas via joins/`count` quando possível, ou calcular no cliente a partir de `servicos.shift_id`.
  - `motivos` — usar `reason_name` já denormalizado em `servicos` (não precisa join).
  - `impactos_expediente` filtrado pelos ids dos expedientes do período — nova `useQuery`.
  - `complementos_servico` idem — nova `useQuery`.
- Gráfico "Atual vs Anterior": `BarChart` com duas séries (`recharts` já instalado).
- Sem novas dependências.

## Fora de escopo (fica para depois, se você quiser)

- Metas configuráveis por equipe (hoje comparamos com o período anterior; meta manual pode entrar num próximo passo).
- Ranking entre equipes / visão do supervisor consolidando várias equipes (exigiria mudança de policy — hoje cada equipe só vê a si mesma).
- Notificações automáticas para o grupo do WhatsApp (integração externa).

Confirma que posso seguir com esse escopo?
