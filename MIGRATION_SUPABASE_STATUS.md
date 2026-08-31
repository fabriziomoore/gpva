# ACP / GPVA — Registro Mestre da Migração para Supabase Próprio

Atualizado em 2026-08-31.

## Destino canônico

- Supabase: `zerepuiyqbenogeyllxb`
- Branch: `migration/supabase-proprio`
- `main` permanece sem merge até validação final.

## Origem

- Projeto Lovable: `bd7c2a2f-3902-4ea7-b2ad-ef2bb1d63958`
- Supabase antigo: `wfagryjdwyhrwlpcxyui`
- Estado atual do conector de origem: consultas SQL retornando `499 request_cancelled`.
- Regra: não reconstruir usuários, senhas ou UUIDs por suposição.

## Checklist

- [x] Corrigir configuração do cliente Supabase para ENV própria.
- [x] Remover `.env` versionado e proteger secrets no Git.
- [x] Apontar `supabase/config.toml` para o projeto correto.
- [x] Reconstruir as 19 tabelas finais do schema `public`.
- [x] Reconstruir enums `app_role` e `procedimento_status`.
- [x] Reconstruir FKs, índices e constraints essenciais.
- [x] Reconstruir RLS operacional/admin.
- [x] Reconstruir árvore Setor → Supervisor → Líder → Equipe.
- [x] Reconstruir RPCs/validações de Procedimentos.
- [x] Reconstruir `audit_schema_snapshot()`.
- [x] Preservar configuração dos Google Forms.
- [x] Preservar UUID canônico de `Corte e Religa`: `16bbd6c9-0469-40b0-95c8-a2909e7312c1`.
- [x] Confirmar que foto de equipe é Data URL em `equipes.photo_url`; não depende de bucket para esse fluxo.
- [x] Preparar importador Auth com UUID/hash preservados e dry-run.
- [x] Preparar importador `public` em ordem de FK e dry-run.
- [x] Impedir commit acidental de exports de Auth/dados.
- [ ] Obter export seguro de Auth da origem.
- [ ] Migrar Auth preservando UUID e hash de senha.
- [ ] Obter export das tabelas `public` da origem.
- [ ] Migrar dados estruturais e operacionais preservando UUIDs/timestamps.
- [ ] Inventariar outros objetos de Storage, se existirem.
- [ ] Remover senha administrativa hardcoded do backend web e da Edge Function.
- [ ] Configurar `ACP_ADMIN_PASSWORD` como secret server-side.
- [ ] Implantar `admin-api` no Supabase novo com JWT verificado.
- [ ] Regenerar e versionar `src/integrations/supabase/types.ts` após a carga final.
- [ ] Trocar Web para o Supabase novo.
- [ ] Trocar Android para o Supabase novo.
- [ ] Auditar referências ao backend antigo/Lovable em runtime.
- [ ] Testar login, CRUD, RLS, hierarquia, expedientes, serviços, offline/sync, procedimentos, Google Forms e admin.
- [ ] `npm run build:web`.
- [ ] `npm run build:mobile` + `npx cap sync android`.
- [ ] Confirmar zero chamadas ao ref antigo `wfagryjdwyhrwlpcxyui`.
- [ ] Merge em `main` somente após aprovação dos testes.

## Ferramentas de carga preparadas

### Auth

`scripts/migrate-auth-from-export.mjs`

- Dry-run por padrão.
- `--apply` obrigatório para escrita.
- Mantém UUID V4 via `auth.admin.createUser({ id })`.
- Aceita `password_hash`/`encrypted_password` sem imprimir o hash.
- Requer `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` apenas no ambiente local/server.

### Dados public

`scripts/migrate-public-from-export.mjs`

- Dry-run por padrão.
- Valida previamente IDs de `auth.users` utilizados pelas FKs.
- Executa upserts em ordem de dependência.
- Preserva IDs presentes nos exports.

## Segurança

- `SUPABASE_SERVICE_ROLE_KEY` é estritamente server-only.
- `ACP_ADMIN_PASSWORD` foi documentada em `.env.example` como server-only.
- A Edge Function `admin-api` ainda NÃO deve ser implantada enquanto a senha estiver hardcoded no código atual.
- Exports com hash de senha/dados pessoais não devem ser commitados; `.gitignore` já cobre `migration-exports/` e padrões de export Auth.

## Estado aproximado

- Schema/estrutura: 99%
- RLS/RPC/segurança de banco: 95%
- Auth/dados da origem: 0% (bloqueado pelo acesso à origem)
- Edge Function/runtime final: pendente
- Migração completa estimada: ~71%

## Próxima microetapa exata

1. Recuperar acesso somente leitura à origem ou obter dump/export da origem.
2. Validar export de Auth em dry-run.
3. Aplicar Auth preservando UUIDs e hashes.
4. Validar export `public` em dry-run.
5. Aplicar dados em ordem de FK.
