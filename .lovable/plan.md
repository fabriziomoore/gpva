## Situação

O banco atual (após o restore anterior) contém serviços da RIOCERLT-017 até **02/07/2026** (29 registros). O dia **03/07/2026 está com 0 registros** — o snapshot restaurado foi anterior ao seu trabalho do dia 3.

Não é possível "gerar" esses dados a partir do código: eles precisam vir de um snapshot de backup que inclua o dia 3.

## Plano de recuperação

### 1. Novo Point-in-Time Recovery (PITR) — feito por você no painel
No **Backend → Advanced settings → Backups → Point-in-time recovery**, escolher um horário **posterior ao seu trabalho do dia 03/07/2026** e **anterior à exclusão em massa** que causou a perda.

- Se você lembra aproximadamente quando registrou os últimos serviços do dia 3 e quando ocorreu a exclusão, escolha um timestamp entre esses dois momentos.
- Se não lembrar, tente um horário no fim do dia 03/07 ou início do dia 04/07 (horário de Brasília / UTC-3).

### 2. Cuidado importante
Um novo PITR **substitui** o estado atual do banco. Isso significa que qualquer coisa criada/alterada **após** o timestamp escolhido será perdida. Por isso, antes de você acionar o PITR, eu exporto um CSV do que existe hoje (serviços, expedientes, equipes, complementos) e guardo em `/mnt/documents/`, para reimportarmos manualmente o que faltar depois.

### 3. Após o PITR
- Eu confirmo por consulta se o dia 03/07 voltou.
- Se voltou parcialmente, comparo com o CSV exportado e reinsiro (via migration) apenas o que ficou faltando dos dias 01, 02 e 03.
- Reaplico as migrations recentes que estruturam colunas/tabelas que possam ter sido perdidas novamente (setores, user_roles, GPS, etc.).

### 4. Se o PITR não cobrir o dia 3
Depende da retenção do plano: se o dia 3 está fora da janela de retenção de PITR, os dados **não são recuperáveis**. Nesse caso, a única opção é reinserir manualmente com base em anotações/print/APK offline se você tiver.

## Próximo passo pedido a você

Antes de eu executar qualquer coisa, me confirme:

1. Você quer que eu **exporte um snapshot CSV do estado atual** (segurança antes do PITR)?
2. Consegue estimar **o horário do último serviço registrado no dia 03/07** e **o horário da exclusão em massa**? Isso me ajuda a te sugerir o timestamp exato do PITR.
