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

`SyncBadge` (no header):
- 🟢 verde — tudo sincronizado
- 🟡 amarelo — sincronizando agora
- 🟠 laranja — N operações pendentes ou erro recuperável
- 🔴 vermelho — offline

Toque no badge para forçar `drainOutbox()`.

## Gerar APK Android

```bash
bun install
bun run build
npx cap sync android
npx cap open android   # abre Android Studio para build/assinatura
```

Para iOS use `npx cap sync ios && npx cap open ios` no macOS.

## Catálogos

Edição de catálogos (Administração) continua exigindo internet — escrita
direta no Supabase via `admin.functions.ts`. Leituras (formulário de
serviços, finalizar expediente) usam cache local e funcionam offline.
