# Plano de Implementação: Monitoramento de Constância de Inviáveis

Este plano detalha a criação de um sistema de identificação e monitoramento de matrículas que apresentam inviabilidade recorrente (mais de uma vez no mês ou em meses consecutivos pelo mesmo motivo), integrando essas informações visualmente no relatório do líder através de símbolos, números e cores.

## 1. Lógica de Identificação de Recorrência

*   **Recorrência no Período Atual**: Identificar matrículas que aparecem mais de uma vez na lista de inviáveis do período selecionado.
*   **Recorrência Histórica (M-1)**: Verificar se a matrícula foi marcada como inviável no mês anterior pelo **mesmo motivo**.
*   **Critério de Unicidade**: A combinação de `matricula` + `motivo` será a base para a monitoração.

## 2. Alterações no Data Scheme do PDF

*   Atualizar a interface `LeaderPdfInput` no arquivo `src/lib/leader-pdf.ts` para que cada item em `all_unviable` suporte metadados de recorrência:
    ```typescript
    all_unviable: { 
      name: string; 
      registration: string; 
      constancy?: { 
        count: number; // Qtd no período atual
        repeat_prev: boolean; // Repetiu do mês anterior?
      } 
    }[]
    ```

## 3. Implementação da Lógica no Dashboard do Líder

*   No arquivo `src/routes/_authenticated/leader.tsx`:
    *   Aprimorar a função `handleExportPdf` para calcular a constância antes de gerar o PDF.
    *   Realizar uma busca (ou utilizar os dados já carregados em cache) dos serviços inviáveis do mês anterior para comparação.
    *   Mapear os serviços inviáveis atuais e anexar as flags de `count` e `repeat_prev`.

## 4. Visualização no Relatório PDF (Símbolos + Cores)

*   No arquivo `src/lib/leader-pdf.ts`, na tabela "INVIÁVEIS DETALHADAS":
    *   **Cores**: Linhas com recorrência terão destaque visual (ex: fundo levemente avermelhado ou texto em destaque).
    *   **Números**: Se a matrícula apareceu 2 ou mais vezes no período, exibir `(2x)`, `(3x)`, etc., em negrito e cor de alerta.
    *   **Símbolos**: 
        *   `🔄` ou `⚠️` para indicar que o problema persiste desde o mês anterior.
        *   Uso de ícones minimalistas para não sobrecarregar o visual, conforme solicitado ("nada de parecer escrito").

## 5. Próximos Passos

1.  Modificar os tipos no `leader-pdf.ts`.
2.  Implementar o cálculo de recorrência no `leader.tsx`.
3.  Estilizar a tabela de inviáveis no PDF para renderizar os novos indicadores.
4.  Validar o alinhamento das colunas com os novos símbolos.