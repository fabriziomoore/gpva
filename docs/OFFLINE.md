# GPVA Offline-First — Notas Técnicas

App híbrido (PWA + Capacitor Android/iOS) com escrita 100% local e
sincronização em segundo plano.

## Camadas

- `src/lib/db/local-db.ts` — Dexie/IndexedDB. Tabelas espelham o Supabase
  (`shifts`, `services`, `complement_links`, `shift_impacts`) + `outbox` + `kv`.
- `src/lib/db/repos.ts` — escreve no Dexie e enfileira o upsert na `outbox`.
- `src/lib/db/catalogs.ts` — busca catálogos do servidor e mantém cópia em
  `kv` para fallback offline.
- `src/lib/sync/engine.ts` — drena a `outbox` em ordem determinística:
  `shifts → services → service_complement_links → shift_impacts`.
- `src/lib/sync/network.ts` — `@capacitor/network` no nativo, `navigator.onLine`
  no web.
- `src/lib/sync/session-backup.ts` — espelha a sessão Supabase no
  `@capacitor/preferences` (nativo) para sobreviver à limpeza do WebView.

## IDs

UUID v4 é gerado **no cliente** (`newId()`). O mesmo id é usado localmente e
no Supabase, então retries são idempotentes via `upsert(onConflict: "id")` —
não precisamos de `client_uuid` separado nem de trigger de `updated_at`
enquanto o sync for push-only.

## Indicador de status

`SyncIndicator` fica como uma linha dinâmica abaixo do cabeçalho:
- azul/ciano/verde — normal/sincronizado
- animação de feixe — sincronização em andamento
- laranja — operações pendentes ou erro recuperável
- vermelho — offline

Toque na linha para abrir o painel informativo e forçar `drainOutbox()`.

## Arquitetura multiplataforma

Base de código única (Web + Android + iOS) com processos de build separados:

| Plataforma | Comando            | Saída                | Runtime                 |
| ---------- | ------------------ | -------------------- | ----------------------- |
| Web (SSR)  | `npm run build`    | `dist/` (Nitro)      | Cloudflare/Node SSR     |
| Mobile SPA | `npm run build:mobile` | `dist/capacitor/` | Capacitor WebView (APK/IPA) |

`npm run build:mobile` roda o build Vite e o script
`scripts/build-capacitor-spa.mjs`, que monta um shell SPA estático
(`index.html` + `assets/`) a partir de `dist/client/`. O `capacitor.config.ts`
aponta `webDir` para `dist/capacitor`.

### Android

```bash
npm install
npm run mobile:android   # build + cap sync + abre Android Studio
```

Comandos granulares:
- `npm run mobile:add:android` — cria a plataforma `android/` (apenas 1ª vez).
- `npm run mobile:sync` — build mobile + `cap sync android`.
- Geração de APK/AAB: Android Studio → Build → Generate Signed Bundle/APK.

### iOS (requer macOS + Xcode)

```bash
npm run mobile:add:ios
npm run mobile:ios       # build + cap sync + abre Xcode
```

### O que é compartilhado

Toda a lógica de negócio, componentes, rotas, autenticação (Supabase),
Dexie/Offline-First, sync engine, geração de PDF e share via WhatsApp
vivem em `src/` e são idênticos em todas as plataformas. Apenas o pipeline
de build muda. Plugins nativos (Network, Preferences, e futuros: Push,
Biometria, FileSystem, Share nativo, OTA) são plugáveis via Capacitor sem
afetar o build Web.

## Catálogos

Edição de catálogos (Administração) continua exigindo internet — escrita
direta no Supabase via `admin.functions.ts`. Leituras (formulário de
serviços, finalizar expediente) usam cache local e funcionam offline.
