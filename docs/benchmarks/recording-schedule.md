# Consulta do próximo horário de gravação

Medição local em Windows, Node.js 25.4.0, em 2026-09-30. Compara
`nextScheduledAt` anterior à alteração com a implementação atual, com as mesmas
entradas e verificação de igualdade dos resultados.

Cada cenário recebeu 20 chamadas de aquecimento por implementação, seguidas de
7 amostras de 100 chamadas. Tempos medidos com `performance.now()`; a tabela
mostra a mediana por lote de 100 chamadas.

| Cenário | Antes | Depois |
| --- | ---: | ---: |
| Sem períodos cadastrados | 115,22 ms | 0,13 ms |
| Um período desabilitado | 116,88 ms | 0,07 ms |
| Um período semanal habilitado | 89,59 ms | 50,69 ms |

A data de consulta foi `new Date(2026, 0, 5, 12)`, no fuso America/Manaus.
O período dos dois últimos cenários foi domingo, das 09:00 às 10:00. O caso
habilitado retornou `2026-01-11T13:00:00.000Z` nas duas implementações.

A referência anterior percorre até 11.520 minutos, chamando `isScheduledAt`
a cada passo. A nova implementação retorna imediatamente para agendas sem
períodos habilitados e prepara os intervalos numéricos uma vez por consulta.
O avanço por minutos locais foi preservado para manter o comportamento em
mudanças de horário de verão.

Os testes de regressão comparam a consulta otimizada com a busca minuto a minuto,
incluindo meia-noite, virada de semana, períodos desabilitados e datas próximas
às transições de horário de verão dos EUA. Também foram executados com
`TZ=America/New_York`, `TZ=Europe/Berlin` e `TZ=Australia/Lord_Howe`.

Esses números medem somente o cálculo em memória; não representam o tempo total
de carregamento da interface, consultas SQLite ou comunicação com câmeras.
