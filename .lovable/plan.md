# Plano de Correção: Período do Relatório PDF

O usuário relatou que o "Período analisado" no cabeçalho do PDF gerado no Painel do Líder reflete o momento da geração (ex: Agosto de 2026) e não o período efetivamente selecionado pelos filtros do aplicativo (ex: Julho de 2026).

## Problema Identificado
No arquivo `src/lib/leader-pdf.ts`, a função `renderLeaderPdfBlob` utiliza `new Date()` como referência padrão para formatar o rótulo do período (`periodStr`), ignorando as datas reais de início e fim dos dados filtrados.

## Ações

### 1. Ajustar `LeaderPdfInput` e `renderLeaderPdfBlob`
- Modificar o tipo `LeaderPdfInput` para aceitar um campo opcional `custom_date` ou `reference_date`.
- Atualizar a lógica de `periodStr` para usar essa data de referência em vez de `now`.

### 2. Atualizar `src/routes/_authenticated/leader.tsx`
- No `handleExportPdf`, passar a data correta baseada no `customRange` selecionado pelo usuário.
- Se o usuário selecionou um mês específico no passado, o PDF deve exibir esse mês.

## Arquivos a serem modificados:
- `src/lib/leader-pdf.ts`: Alterar a geração do rótulo do período.
- `src/routes/_authenticated/leader.tsx`: Passar a data de referência correta para o gerador de PDF.

## Verificação
- Gerar um relatório para um mês anterior e validar se o texto "Período analisado" reflete o mês escolhido.
