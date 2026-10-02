# ACP no iPhone — Plano (pendente)

Desejo registrado em 01/10/2026: ter o ACP também no iPhone. Ainda não
começou; este arquivo guarda o que já foi levantado pra continuar depois.

## Decisão até aqui

- **Sem custo:** o caminho é o **app web instalado na Tela de Início**
  (PWA): Safari → Compartilhar → "Adicionar à Tela de Início". Abre em tela
  cheia, com ícone, e atualiza junto com o deploy (sem loja, sem APK).
- **App nativo (Capacitor iOS) fica pra depois**, só se valer a pena pagar:
  exige conta Apple Developer (US$ 99/ano) e compilar em macOS (não há Mac;
  daria pra usar runner macOS do GitHub Actions) e distribuir por TestFlight
  ou App Store. Instalação "grátis" com Apple ID comum expira a cada 7 dias —
  não serve pra equipe.

## O que já existe

- `@capacitor/ios` instalado e bloco `ios` em `capacitor.config.ts`; falta
  gerar a pasta `ios/` (`bun x cap add ios`) — só necessário no caminho nativo.
- PWA: `public/manifest.webmanifest`, `public/apple-touch-icon.png`,
  `vite-plugin-pwa` em `vite.config.ts` e registro em `src/lib/pwa/register.ts`.
- Dados offline (Dexie/IndexedDB + outbox, ver `docs/OFFLINE.md`) e login
  offline (`src/lib/offline-auth.ts`) já funcionam no navegador.

## Problema principal encontrado: o app web não abre sem internet

O build web (TanStack Start + Nitro → Cloudflare Workers) gera o service
worker em `dist/sw.js` com **"precache 0 entries"**, mas o que é publicado é
`.output/public` — então o `sw.js` não vai pro ar e nenhuma tela fica
guardada no aparelho. Resultado no iPhone: com o app aberto, a queda de sinal
é tolerada (registros ficam locais e sobem depois); **abrir o app já sem
sinal falha**. No Android não acontece porque o APK leva as telas dentro.

Para corrigir:
1. Fazer o `vite-plugin-pwa` gerar o SW dentro de `.output/public` (ou copiar
   no build) e precachear os assets do cliente.
2. Como o app é SSR, não existe `index.html` estático pro `navigateFallback:
   "/"` — gerar uma "casca" SPA (shell) pra servir offline em qualquer rota.
3. Testar em iPhone real no Safari: abrir sem internet, registrar, voltar a
   internet e sincronizar.

## Outros pontos a revisar no iPhone

- Área segura (entalhe/barra de status) e `apple-mobile-web-app-*` metas.
- Teclado cobrindo campos nos formulários (Adicionar serviço, KM).
- Permissão de localização no Safari (GPS dos serviços).
- Botão "voltar" do Android não existe no iPhone — navegação só pela tela.
- iOS não sincroniza em segundo plano pra app web: pendentes só sobem com o
  app aberto e com internet.
- Escrever o passo a passo de instalação pras equipes.

## Falta saber

- Em qual endereço o app web está publicado (o domínio não está no repo).
