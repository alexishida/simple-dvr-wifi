# Plano — gravação agendada

## Escopo

Implementar agenda semanal por câmera no processo principal, preservando o
comando manual e a gravação contínua existentes. O aplicativo precisa estar em
execução; não há serviço do Windows neste escopo.

## Regras

- Comando manual tem prioridade e não é interrompido por uma janela agendada.
- Uma câmera desativada não inicia uma sessão pela agenda.
- Períodos que atravessam a meia-noite são normalizados por dia.
- Sobreposições resultam em uma única sessão por câmera.
- A agenda é reavaliada na inicialização, após suspensão e mudança de relógio.

## Aceite

- Testar meia-noite, sobreposição, suspensão, reinício, queda de rede e
  concorrência entre comando manual e agenda.
- Recuperar segmentos incompletos e indicar lacunas na biblioteca.
- Não duplicar sessões nem interromper a visualização ao vivo.

## Implementação

- A agenda é armazenada em `recording_schedules` e editada em Configurações.
- O processo principal a reconcilia ao iniciar, ao retomar da suspensão, ao
  receber foco e a cada 30 segundos; execuções concorrentes são serializadas.
- Uma parada manual durante uma gravação agendada suprime somente a janela
  atual. Uma câmera desativada, sem stream ou sem espaço permanece impedida e
  é reavaliada na próxima reconciliação.
- Na inicialização, gravações deixadas em andamento são marcadas como
  interrompidas e os segmentos existentes são novamente catalogados. Arquivos
  ausentes continuam visíveis como lacunas na biblioteca.
