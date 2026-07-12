---
name: Change protocol & module independence
description: Antes de qualquer modificação, listar arquivos e justificar; manter independência entre offline-auth, NetworkService e Sync
type: preference
---

## Protocolo de alteração

Antes de modificar qualquer arquivo:
1. Listar todos os arquivos que serão alterados.
2. Justificar por que cada arquivo precisa mudar.
3. Não tocar em módulos não relacionados ao problema atual.
4. Se a alteração for apenas para diagnóstico (logs), declarar explicitamente "somente instrumentação, sem alteração de lógica".

## Independência de módulos

- **offline-auth** (`src/lib/offline-auth.ts`, `src/lib/sync/session-backup.ts`) NUNCA pode modificar o estado de conectividade nem chamar `supabase.auth.setSession()` offline (dispara refresh → SIGNED_OUT → localStorage apagado).
- **NetworkService** (`src/lib/sync/network.ts`) NUNCA pode depender do sistema de autenticação. É a única fonte de verdade de `deviceOnline` e `backendReachable`.
- **Sync engine** (`src/lib/sync/engine.ts`, `init.ts`) apenas CONSOME o estado de conectividade via `useSyncStore`. Não escreve nele.
- Login offline hidrata a sessão em `localStorage` diretamente via `hydrateLocalStorageFromBackup()` — nunca via `restoreSession({force:true})`.