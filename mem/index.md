# Project Memory

## Core
Deploy é via GitHub Actions (`.github/workflows/deploy.yml`): push pra `main` builda e publica web (Cloudflare Workers) e Edge Functions do Supabase. Verificar que o run da Action passou antes de considerar uma mudança publicada.
Antes de modificar qualquer arquivo, listar todos os arquivos que serão alterados e justificar cada um. Não tocar em módulos não relacionados ao problema.
Módulos independentes: offline-auth NUNCA modifica conectividade; NetworkService NUNCA depende de auth; Sync apenas consome estado de conectividade.

## Memories
- [Change protocol](mem://rules/change-protocol) — Regra de anúncio prévio de alterações e independência de módulos (auth/network/sync).
## Rebrand
App chamado ACP — Assistente de Campo e Produtividade (logo Águas do Rio). Logo via <AppLogo/> (src/components/brand/AppLogo.tsx) com arte clara/escura. Não restaurar marcas GPVA ou ASSIS GESP.
