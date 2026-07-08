
# Plano: App 100% funcional offline

Hoje o GPVA já tem uma base offline-first parcial (IndexedDB + outbox para expedientes, serviços, vínculos e impactos). Os pontos que **ainda quebram sem internet** são:

1. Abrir o app sem rede → o navegador tenta baixar `index.html` e falha (não há service worker).
2. Tiles do Google Maps → mapa em branco offline.
3. Reverse geocode (endereço textual) e geração de PDF do relatório de líder → dependem de rede.
4. Configurações do líder, Google Form, seeding de catálogos e algumas leituras vão direto ao Supabase (sem cache).
5. Falta feedback visual claro de "offline / X ações pendentes".

## O que será feito

### 1. PWA com service worker (app abre offline)
- Adicionar `vite-plugin-pwa` em modo `generateSW` + `registerType: "autoUpdate"`.
- Wrapper de registro guardado (só registra em produção, fora do preview/iframe do Lovable, suporta `?sw=off` como kill-switch).
- Estratégias:
  - Navegações HTML → `NetworkFirst` (fallback para `index.html` cacheado).
  - Assets hasheados do build → `CacheFirst`.
  - Excluir `/~oauth`, `/api/*`, chamadas ao Supabase e ao gateway.
- Manifest já existe; apenas garantir `display: standalone` e ícones.

### 2. Mapa offline (tiles em cache)
- Cachear runtime dos tiles `https://*.googleapis.com/maps/vt*` e `https://*.gstatic.com/*` com `CacheFirst` + expiração (ex.: 30 dias, máx. 500 tiles).
- Efeito: regiões já visualizadas ficam navegáveis offline; primeira visita a uma área nova exige rede (limitação do Google — não é permitido pré-baixar em massa).
- Adicionar aviso discreto "modo offline – mapa limitado à região já visitada" quando `!navigator.onLine`.

### 3. Reverse geocode com cache
- Cachear no IndexedDB (`kv` ou nova store `geocode_cache`) chave `lat,lng` arredondado → endereço.
- Se offline e sem cache: usar coordenadas cruas no PDF/UI, sem quebrar.

### 4. Estender outbox para o resto do fluxo
- Auditar operações que ainda chamam `supabase.from(...).insert/update/delete` diretamente em rotas do líder (config, google_form_settings, catálogos) e migrá-las para o mesmo padrão do `repos.ts` (grava local `pending` + enfileira em `outbox`).
- Leituras (`select`) que hoje só funcionam online: já existe mirror local para as tabelas de expediente; espelhar também `google_form_settings`, `expedientes` do líder e catálogos administrativos que a UI mobile lê.
- Garantir que a ordem de drenagem em `engine.ts` cobre as novas tabelas.

### 5. Geração de PDF offline
- `renderLeaderPdfBlob` já roda no cliente; remover dependências que exigem rede (reverse geocode passa a usar cache/coordenadas) para que o PDF gere offline. Fontes/imagens embutidas já são bundle → OK.

### 6. Feedback de UI (sem mudar design)
- Reaproveitar o `useSyncStore` existente para exibir um badge discreto no header já presente: "Offline – N pendentes". Nada além disso muda visualmente.

## Fora do escopo
- Login inicial sem internet (Supabase Auth precisa validar a primeira sessão; após logar uma vez a sessão é reidratada offline — comportamento atual mantido).
- Convite/reset de senha, chamadas administrativas que exigem `service_role`.
- Pré-download em massa de tiles do Google (proibido pelos termos).

## Detalhes técnicos

- Novo arquivo `src/lib/pwa/register.ts` com os guards do skill de PWA.
- `vite.config.ts`: adicionar `VitePWA({ registerType: "autoUpdate", injectRegister: null, devOptions: { enabled: false }, workbox: { navigateFallback: "/", runtimeCaching: [...] } })`.
- Novo `src/lib/db/geocode-cache.ts` + ajuste em `src/lib/reverse-geocode.ts` (try-cache → try-network → fallback).
- Expandir `src/lib/db/repos.ts` com funções para google_form_settings, catalog seeding e afins; ajustar chamadas nas rotas do líder para passarem por elas.
- Testes manuais: DevTools → Network offline → recarregar app → navegar entre rotas → registrar serviço → gerar PDF → voltar online → confirmar drenagem da outbox.

## Riscos

- Cache stale de tiles/assets → mitigado por `autoUpdate` + kill-switch `?sw=off`.
- Aumento de uso de armazenamento no dispositivo (tiles + mirror) → limitar tamanho do cache Workbox e expiração.
- Novos writes offline em `google_form_settings` podem conflitar com edições feitas em outro dispositivo → política simples "último write vence" via `updated_at`.

## Checklist de validação
- [ ] App abre offline após primeiro carregamento.
- [ ] Navegação entre rotas funciona offline.
- [ ] Mapa mostra tiles de regiões já visitadas.
- [ ] Registrar/editar serviço, expediente e impacto offline; sincroniza ao voltar rede.
- [ ] Config do líder salva offline e sincroniza.
- [ ] PDF do líder gera offline (com endereço em cache ou coordenadas).
- [ ] Badge "N pendentes" aparece e zera após sync.
- [ ] `?sw=off` desregistra o SW.
