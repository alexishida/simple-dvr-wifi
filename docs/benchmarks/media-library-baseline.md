# Medição inicial da biblioteca de mídia

Execute `npm run benchmark:library` em uma máquina sem outras cargas relevantes.
O comando cria dois catálogos SQLite apenas em memória, sem tocar na biblioteca
do usuário, faz uma consulta de aquecimento e mede cinco carregamentos.

Cada carregamento realiza quatro consultas do catálogo: snapshots e gravações,
ambas sem filtro, e as mesmas duas consultas filtradas pela primeira câmera
(a consulta de gravações também recebe um intervalo temporal). `queryCount` é a
quantidade dessas consultas de alto nível; `heapDeltaBytes` e `rssDeltaBytes`
referem-se exclusivamente ao período medido.

| Catálogo | Câmeras | Gravações / segmentos | Snapshots | Repetições | Consultas |
| --- | ---: | ---: | ---: | ---: | ---: |
| Pequeno | 3 | 30 / 30 | 45 | 5 | 20 |
| Grande | 8 | 2.000 / 2.000 | 2.400 | 5 | 20 |

Os valores de tempo e memória variam por hardware e versão do Electron. Registre
o JSON emitido pelo comando junto da data, versão do Node/Electron e hardware ao
comparar alterações futuras. A medição avalia apenas carregamento do catálogo;
miniaturas e decodificação de vídeo ficam fora deste recorte.

## Linha de base registrada

Coletada em 2026-09-26T03:32:35Z, com Node 25.4.0 e Electron 44.0.0, no ambiente
de desenvolvimento. O delta de heap pode ser negativo porque a coleta de lixo é
assíncrona; ele deve ser interpretado junto do RSS e de medições repetidas.

| Catálogo | Tempo total | Média por carregamento | Delta heap | Delta RSS |
| --- | ---: | ---: | ---: | ---: |
| Pequeno | 2,01 ms | 0,40 ms | +759.440 B | +204.800 B |
| Grande | 52,40 ms | 10,48 ms | -2.039.620 B | +663.552 B |

## Comparação após exportação de trechos

Coletada em 2026-09-26T03:47:53Z, no mesmo ambiente de desenvolvimento. A
consulta da biblioteca continuou dentro da variação esperada; a exportação usa
um processo separado e seus temporários são removidos ao finalizar.

| Catálogo | Tempo total | Média por carregamento | Delta heap | Delta RSS |
| --- | ---: | ---: | ---: | ---: |
| Pequeno | 1,66 ms | 0,33 ms | +639.236 B | +253.952 B |
| Grande | 37,82 ms | 7,56 ms | -1.964.848 B | +1.056.768 B |
