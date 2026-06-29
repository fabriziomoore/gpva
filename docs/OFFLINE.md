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

## Gerar APK Android

```bash
bun install
bun run build
npx cap add android   # apenas quando a pasta android ainda não existir
npx cap sync android
npx cap open android   # abre Android Studio para build/assinatura
```

O build do TanStack Start/Nitro gera os arquivos web em `.output/public`, e o
`capacitor.config.ts` está configurado com `webDir: ".output/public"`.

Fluxo automatizado recomendado:

```bash
npm run mobile:android
```

Esse comando gera o build, valida o `webDir`, cria a plataforma Android quando
ela ainda não existir, sincroniza os assets e abre o Android Studio.

Para iOS use `npx cap sync ios && npx cap open ios` no macOS.

## Catálogos

Edição de catálogos (Administração) continua exigindo internet — escrita
direta no Supabase via `admin.functions.ts`. Leituras (formulário de
serviços, finalizar expediente) usam cache local e funcionam offline.
