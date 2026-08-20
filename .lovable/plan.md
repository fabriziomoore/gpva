# Plano de Saneamento — Fase 1A (Correção Cirúrgica Pós-Auditoria)

NÃO iniciar Fase 1B ou Fase 2. Criar UMA NOVA migration corretiva.

## 1. Verificação de Viabilidade de Owner
Antes de qualquer alteração estrutural, a migration verificará se é possível configurar `OWNER = internal_proc_executor` na RPC sem depender de `SET ROLE` interno ou GUCs. Se o ambiente restringir essa arquitetura, a execução deve ser interrompida.

## 2. Eliminação de Redundâncias e Legados
- **RPCs**: Remover `public.publish_procedure_version(uuid)` (assinatura antiga). Manter exatamente UMA: `public.publish_procedure_version(uuid, date, uuid)`.
- **Triggers**: Remover `trigger_immutability_final` e sua função `public.trg_enforce_versao_immutability()`. Manter apenas o canônico `trg_procedimento_versao_integrity`.
- **GUCs**: Eliminar qualquer referência a `app.internal_mutation` ou `set_config` em funções ativas.

## 3. Arquitetura de Identidade Canônica
- **RPC**: `SECURITY DEFINER`, `OWNER = internal_proc_executor`. Sem `SET ROLE` no corpo da função.
- **Trigger**: `public.check_procedimento_versao_integrity()` deve ser `SECURITY INVOKER`. Ele identificará a trilha privilegiada via `current_user = 'internal_proc_executor'`.
- **Membership**: Remover qualquer membership de `anon`, `authenticated`, `authenticator`, `service_role`, `leader` ou `admin` na role `internal_proc_executor`.

## 4. Refinamento de Triggers (Whitelist Exata)
- **Trilha Interna (Caso A - Publicação)**: Somente `status`, `published_at`, `publicado_por_id`, `status_updated_at`, `status_alterado_por_id` podem mudar.
- **Trilha Interna (Caso B - Sucessão)**: ÚNICO campo alterável é `vigencia_fim`. Auditoria de status (`status_updated_at`, etc) deve permanecer idêntica.
- **Trilha Normal**: Somente `status`, `status_updated_at`, `status_alterado_por_id`. Bloquear `draft -> published`.

## 5. Lógica de Sucessão e Vigência
- **Vigência**: Manter `DATE` [início, fim). Publicação não altera `vigencia_inicio`.
- **Sucessão**: Usar `substitui_versao_id` persistido no próprio draft. Validar contra parâmetro da RPC se fornecido.
- **JSONB**: Validar unicidade de IDs dos nodes e integridade estrutural no backend.

## 6. Saneamento de RLS
Remover todas as policies duplicadas em `procedimento_versoes`. Manter apenas as 6 políticas canônicas definidas (Ver Detalhes Técnicos).

## Detalhes Técnicos
### RLS Canônica (procedimento_versoes)
1. **Equipes**: SELECT published ativos.
2. **Líderes/Admins**: SELECT tudo.
3. **Líderes/Admins**: INSERT status='draft'.
4. **Líderes/Admins**: UPDATE status='draft'.
5. **Líderes/Admins**: UPDATE status histórico (published -> suspended/archived).
6. **Líderes/Admins**: DELETE status='draft'.

### Validação JSONB (Backend)
- `COUNT(nodes) == COUNT(DISTINCT node.id)`
- Estrutura completa de `question/answers` e `result/instruction`.

### Frontend
- Ajustar `leader-procedures.tsx` para exibir campos `DATE` sem deslocamento de timezone (formatação direta de string `YYYY-MM-DD`).
- Garantir envio de `p_substitui_versao_id` na RPC de publicação.

## Testes Bloqueantes
BH-CC: Unicidade de assinatura RPC, ausência de GUCs, Owner canônico, Whitelist de triggers, Unicidade de nodes JSONB, Sucessão exata, Integridade da Zona Protegada.
