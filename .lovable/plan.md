## Diagnóstico

O banco está correto: `tipos_servico` tem 12 linhas ativas, todas com `team_id = NULL` (globais). A tela do preview web também está lendo dessa lista após minha última atualização (`src/lib/db/catalogs.ts` foi corrigido para não filtrar mais por equipe).

O print veio do **app Android instalado** (o "GPVA" no nome do arquivo). Esse APK ainda contém o bundle JavaScript antigo, que consulta `.eq("team_id", userId)` — como agora todas as linhas têm `team_id` nulo, o app antigo recebe zero linhas e a lista aparece vazia. O mesmo se aplica ao cache local do Dexie que possivelmente guardou array vazio durante a janela de bug.

## Correção

1. **Rebuild do Android**: rodar `bun run build:capacitor` (ou o script equivalente do projeto) para gerar `www/` com o JS novo e sincronizar com o Android (`npx cap sync android`). Isso não gera APK aqui no ambiente — o usuário precisa abrir Android Studio (ou rodar `./gradlew assembleDebug`) na máquina local para instalar.
2. **Cache local**: adicionar no `src/lib/sync/init.ts` (ou onde inicializa o Dexie) uma limpeza única das chaves antigas `cat:*:<uuid>` — assim, quando o novo APK subir, ele não lê array vazio antigo. Chave nova (`cat:*:global`) fica intacta.
3. **PWA/browser**: no navegador é só recarregar; não há service worker registrado.

## O que preciso confirmar

Antes de rodar o build, quero saber: você quer que eu apenas prepare os arquivos web novos (`www/`) prontos para sincronizar, ou que eu também apague as chaves antigas de catálogo no cache local automaticamente na próxima abertura?
