# ACP / GPVA — Registro Mestre da Migração para Supabase Próprio

Atualizado em 2026-08-31.

## Destino canônico

- Supabase: `zerepuiyqbenogeyllxb`
- Branch: `migration/supabase-proprio`
- `main` permanece sem merge até validação final.

## Origem

- Projeto Lovable: `bd7c2a2f-3902-4ea7-b2ad-ef2bb1d63958`
- Supabase antigo: `wfagryjdwyhrwlpcxyui`
- Estado atual: acesso SQL à origem recuperado e inventário real concluído.
- Auth origem: 7 usuários, todos confirmados, todos com hash de senha e 7 identidades `email`; nenhum usuário deletado.
- Integridade referencial crítica auditada sem referências órfãs.
- Regra: preservar UUIDs, hashes, timestamps e FKs; não reconstruir usuários/senhas por suposição.

## Inventário real da origem

- `auth.users`: 7
- `equipes`: 5
- `expedientes`: 57
- `servicos`: 665
- `active_sessions`: 7
- `audit_reports`: 9
- `catalog_order`: 4
- `complementos_servico`: 10
- `google_form_settings`: 1
- `impactos`: 7
- `impactos_expediente`: 28
- `lideres_estrutura`: 1
- `motivos_inviabilidade`: 20
- `procedimentos`: 0
- `procedimento_versoes`: 0
- `setores`: 1
- `supervisores`: 1
- `tipos_servico`: 15
- `user_roles`: 2
- `vinculos_complementos`: 50

## Storage da origem

- Existe 1 bucket privado: `database_export_08_07_26`.
- Objetos: 1.
- Tamanho total aproximado: 501 KB.
- O nome e o conteúdo esperado indicam artefato de backup/export, não dependência operacional do app.
- O fluxo atual de foto de equipe continua persistindo Data URL em `equipes.photo_url`, sem necessidade de bucket operacional.

## Integridade referencial auditada

- [x] `equipes.id -> auth.users.id`: 0 órfãos.
- [x] `expedientes.team_id -> equipes.id`: 0 órfãos.
- [x] `servicos.team_id -> equipes.id`: 0 órfãos.
- [x] `servicos.shift_id -> expedientes.id`: 0 órfãos.
- [x] `impactos_expediente.shift_id -> expedientes.id`: 0 órfãos.
- [x] `vinculos_complementos.shift_id -> expedientes.id`: 0 órfãos.
- [x] `vinculos_complementos.service_id -> servicos.id`: 0 órfãos.
- [x] `lideres_estrutura.user_id -> auth.users.id`: 0 órfãos.
- [x] `user_roles.user_id -> auth.users.id`: 0 órfãos.

## Checklist

- [x] Corrigir configuração do cliente Supabase para ENV própria.
- [x] Remover `.env` versionado e proteger secrets no Git.
- [x] Apontar `supabase/config.toml` para o projeto correto.
- [x] Reconstruir as 19 tabelas finais do schema `public`.
- [x] Reconstruir enums `app_role` e `procedimento_status`.
- [x] Reconstruir FKs, índices e constraints essenciais.
- [x] Reconstruir RLS operacional/admin.
- [x] Otimizar RLS para evitar `auth_rls_initplan` por linha.
- [x] Eliminar políticas permissivas redundantes relevantes.
- [x] Reconstruir árvore Setor → Supervisor → Líder → Equipe.
- [x] Adicionar integridade de hierarquia de equipe em trigger de banco.
- [x] Reconstruir RPCs/validações de Procedimentos.
- [x] Reconstruir `audit_schema_snapshot()`.
- [x] Habilitar Realtime nas 6 tabelas operacionais necessárias.
- [x] Configurar `REPLICA IDENTITY FULL` nessas 6 tabelas.
- [x] Preservar configuração dos Google Forms.
- [x] Preservar UUID canônico de `Corte e Religa`: `16bbd6c9-0469-40b0-95c8-a2909e7312c1`.
- [x] Confirmar que foto de equipe é Data URL em `equipes.photo_url`; não depende de bucket para esse fluxo.
- [x] Preparar importador Auth com UUID/hash preservados e dry-run.
- [x] Preparar importador `public` em ordem de FK e dry-run.
- [x] Impedir commit acidental de exports de Auth/dados.
- [x] Recuperar acesso somente leitura à origem.
- [x] Inventariar as 19 tabelas e Auth da origem.
- [x] Confirmar 7/7 usuários com hash de senha e email confirmado.
- [x] Auditar integridade referencial crítica da origem.
- [x] Corrigir checkpoint `has_role` para `SECURITY INVOKER`, alinhado ao banco vivo.
- [x] Inventariar Storage da origem.
- [x] Remover senha administrativa hardcoded da rota de login; agora a sessão usa apenas a senha digitada pelo usuário.
- [ ] Migrar Auth preservando UUID e hash de senha.
- [ ] Migrar dados estruturais e operacionais preservando UUIDs/timestamps.
- [ ] Comparar contagens origem × destino após carga.
- [ ] Remover senha administrativa hardcoded restante do backend web, tela admin e Edge Function.
- [ ] Configurar `ACP_ADMIN_PASSWORD` como secret server-side ou concluir transição para JWT + `user_roles`.
- [ ] Implantar `admin-api` no Supabase novo somente após refatoração segura.
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
- Hashes de senha da origem foram verificados para fins de migração e não devem ser expostos nem versionados.
- `ACP_ADMIN_PASSWORD` foi documentada em `.env.example` como server-only.
- A rota `src/routes/auth.tsx` não contém mais senha administrativa fixa; usa a senha digitada na sessão corrente.
- Ainda existem ocorrências hardcoded no backend administrativo/tela admin/Edge Function, que devem ser removidas antes de implantação final.
- A Edge Function `admin-api` ainda NÃO deve ser implantada enquanto houver segredo hardcoded.
- Exports com hash de senha/dados pessoais não devem ser commitados; `.gitignore` já cobre `migration-exports/` e padrões de export Auth.
- `has_role` no checkpoint agora usa `SECURITY INVOKER`, igual ao destino vivo.

## Estado aproximado

- Schema/estrutura: 100%
- RLS/RPC/segurança de banco: ~98%
- Realtime: 100%
- Ferramentas de migração: 100%
- Inventário e auditoria da origem: 100%
- Storage inventariado: 100%
- Auth/dados reais migrados: 0% (carga ainda pendente)
- Refatoração de segredo administrativo: iniciada
- Edge Function/runtime final: pendente
- Migração completa estimada: ~81%

## Bloqueio momentâneo

O conector direto do Supabase de destino está indisponível durante as tentativas de iniciar a carga. Nenhuma escrita parcial foi realizada. A origem continua acessível e auditada.

## Próxima microetapa exata

1. Retomar acesso ao destino `zerepuiyqbenogeyllxb`.
2. Importar os 7 usuários Auth preservando UUIDs e hashes.
3. Validar `auth.users = 7` e identidades funcionais.
4. Importar dados `public` em ordem de FK.
5. Comparar todas as contagens origem × destino e executar checks de integridade.
6. Concluir remoção dos segredos administrativos hardcoded restantes antes do deploy final.
