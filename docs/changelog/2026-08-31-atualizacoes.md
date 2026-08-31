# Atualizações — 31/08/2026

Resumo de tudo que foi alterado nesta sessão, pra usar na descrição da atualização do app.

## Migração pra fora do Lovable (infraestrutura, sem impacto visível pro usuário)

- App não depende mais do build tooling do Lovable (`vite.config.ts` reescrito do zero).
- Deploy próprio via GitHub Actions (Cloudflare Workers + Supabase Edge Functions), substituindo o auto-publish do Lovable.
- Limpeza de código, textos e imagens que referenciavam o Lovable (relatório de erro, storage de auth de preview, meta tags, auditoria interna).
- **Pendente**: migração do banco Supabase (ainda pode estar hospedado pelo Lovable Cloud) — planejada pra um fim de semana sem uso do app, à parte.

## Fluxo do "Pós corte" — mudança de comportamento

- **Ordem invertida**: agora pergunta primeiro se o serviço foi **viável ou não**, e só depois pergunta se **houve negociação** (antes era o contrário).
- A pergunta de negociação passou a valer tanto para **viável quanto inviável** — cliente pode ter pago/negociado mesmo com o serviço não executado (ex.: "Comprovou pagamento" como motivo de inviabilidade).
- Se **não negociado**: finaliza e registra o Pós corte normalmente com os dados já escolhidos.
- Se **negociado** (Sim): segue o mesmo fluxo completo de negociação (matrícula → forma de pagamento → complementos → Forms), igual ao de registrar um serviço de Negociação direto.

## Regra nova: "Variável Estimada" não soma para Pós corte

- O KPI "Variável Estimada" (R$ por negociação) **não soma mais** quando a negociação é de um Pós corte — mesmo assim o "Negociado R$" continua contando o valor normalmente.
- Corrigido em todos os lugares que calculam esse número: painel do técnico (Expediente), painel do líder (visão do próprio time e visão de todos os times), e a página "Variável".

## Redesenho visual — tela de "Adicionar Serviço"

- Cabeçalhos das etapas (Tipo de Serviço, Viável/Inviável, Negociação, Matrícula, Forma de pagamento) agora usam a mesma cor laranja do botão "+ Serviço", em vez do cabeçalho escuro padrão.
- Card de pergunta "foi negociado?": removido excesso visual (ícone, selo, pulsação), texto em caixa alta, sempre em uma linha só, independente do nome do serviço.
- Botões "Sim" / "Não" da negociação: cor de texto e ícone (verde/vermelho), sem preenchimento sólido — visual mais limpo e consistente com os outros botões do app.
- Etapa "Viável/Inviável": cabeçalho mostra só o nome do serviço (sem repetir a pergunta, já que os botões são autoexplicativos).

## Status de envio ao Forms — trocado de texto pra ícone

- O antigo texto "Forms enviado" / "Forms não enviado" virou um badge de ícone, no mesmo padrão dos indicadores de sincronismo e localização: **azul** quando enviado, **vermelho** quando não — toque no vermelho pra tentar reenviar.
- Registros de Pós corte negociado agora mostram "Pós corte - Negociado" no título, pra ficar claro que houve negociação mesmo sem o texto do Forms ali.

## Barra de ações (editar/excluir)

- Ao segurar um serviço da lista, a barra de ações (Editar/Excluir) agora **ocupa o cabeçalho** da tela (em vez de um painel flutuante separado), na cor laranja do "+ Serviço".
- Fecha ao tocar em qualquer lugar fora dela.

## Ajuste menor

- Linha de sincronismo (barra fina colorida abaixo do cabeçalho) aumentada de 2px pra 4px de altura.

---

**Importante**: nada disso chegou no celular ainda — pra levar essas mudanças pro app instalado, ainda falta rodar `bun run mobile:sync` e gerar o APK no Android Studio como de costume. E as mudanças de código ainda não foram commitadas no git.
