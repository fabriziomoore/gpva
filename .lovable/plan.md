O backend está respondendo normalmente e a base não está totalmente zerada.

Contagem atual encontrada:
- equipes: 6
- expedientes: 7
- serviços: 79
- tipos de serviço: 12
- complementos: 10
- motivos de inviabilidade: 20
- impactos: 7

Para a equipe RIOCERLT-017, os serviços de julho aparecem novamente no banco:
- 01/07/2026: 12 serviços
- 02/07/2026: 29 serviços
- 03/07/2026: 0 serviços encontrados

Isso indica que a restauração trouxe parte dos dados de volta, mas os painéis podem estar parecendo vazios por filtro, cache local do APK, mês selecionado, sessão/equipe atual ou consulta do painel.

Plano proposto:

1. Conferir exatamente quais painéis estão vazios
- Admin Ranking
- Serviços no mapa
- Produtividade
- Painel de líder
- Relatórios de expediente

2. Validar filtros e período padrão
- Verificar se o app Android está abrindo em julho/2026 ou em outro período.
- Conferir se o filtro de equipe inclui RIOCERLT-017.
- Garantir que dados restaurados apareçam mesmo após reload/sync.

3. Corrigir o Admin para deixar a situação transparente
- Adicionar contadores visíveis no Admin: total de equipes, expedientes e serviços do período selecionado.
- Exibir mensagem clara quando não houver dados no filtro atual, diferenciando “sem dados no período” de “banco vazio”.
- Melhorar a seção “Serviços no mapa” para mostrar total encontrado antes da lista.

4. Reforçar proteção contra perda de dados
- Manter exclusão em massa desativada.
- Toda ação destrutiva continuará exigindo aviso explícito.
- Próxima melhoria recomendada: implementar lixeira/soft delete para serviços e marcações do mapa, para permitir restauração dentro do app sem depender de backup.

5. Verificação final
- Testar no Admin usando RIOCERLT-017 e período 01/07/2026 a 02/07/2026.
- Confirmar que os 41 serviços aparecem nos painéis relevantes.
- Se algum painel ainda ficar vazio, corrigir a consulta específica dele.