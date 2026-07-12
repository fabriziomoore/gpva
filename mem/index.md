# Project Memory

## Core
Sempre publicar automaticamente após qualquer alteração no app (preview + live + PWA devem ficar sincronizados).
Antes de modificar qualquer arquivo, listar todos os arquivos que serão alterados e justificar cada um. Não tocar em módulos não relacionados ao problema.
Módulos independentes: offline-auth NUNCA modifica conectividade; NetworkService NUNCA depende de auth; Sync apenas consome estado de conectividade.

## Memories
- [Change protocol](mem://rules/change-protocol) — Regra de anúncio prévio de alterações e independência de módulos (auth/network/sync).