# Compatibilidade de eventos de movimento ONVIF

## Estado verificado

O aplicativo descobre dispositivo, mídia, perfis e PTZ por ONVIF e implementa
assinatura PullPoint, renovação, `PullMessages` e tratamento de tópicos de
movimento. A compatibilidade continua dependente de cada câmera e firmware.

O simulador ONVIF do repositório também não anuncia nem produz eventos. Assim,
nenhum modelo de câmera tem suporte a eventos de movimento confirmado neste
ambiente.

| Origem | Suporte a movimento ONVIF | Evidência |
| --- | --- | --- |
| Simulador interno | Não confirmado | Não anuncia Event Service nem emite tópicos. |
| Câmeras físicas | Pendente | Não há hardware conectado neste ambiente. |

## Critério para declarar compatibilidade

Para cada modelo e firmware, registrar na matriz R.2 de `tasks.md`:

1. disponibilidade do Event Service e do método de assinatura;
2. tópico recebido para início e término de movimento;
3. renovação e reconexão após queda da câmera;
4. diferença entre o relógio da câmera e o computador;
5. limitações observadas.

Até essa validação, a gravação por movimento permanece desativada por padrão;
os modos manual e agendado continuam independentes.

## Linha do tempo e testes

Eventos de início e fim aparecem como marcadores na linha do tempo da câmera.
Os filtros permitem selecionar tipo de evento, presença de vídeo vinculado e
gravações com ou sem movimento. Ao abrir um marcador com vídeo, o player procura
o segmento que contém o instante; se houver lacuna, abre o trecho mais próximo.
Eventos sem gravação associada continuam visíveis e identificados como sem vídeo.
Os marcadores e a busca no vídeo usam a hora de recebimento do computador,
para acompanhar os segmentos gravados localmente; quando a hora informada pela
câmera diverge, ela aparece na dica do marcador.
Eventos persistidos por versões anteriores, antes do vínculo no catálogo,
também podem aparecer sem vídeo associado. A consulta diária exibe até 1.000
ocorrências recentes por câmera.

Testes automatizados simulam eventos repetidos, várias notificações em uma
resposta PullMessages, perda de PullPoint, falha de renovação, câmera sem Event
Service e ausência de evento de término. Nessa última situação, uma gravação
por movimento é encerrada após até 10 minutos sem novo sinal de atividade
(ou após o tempo pós-evento, se este for maior). Eventos recebidos apenas após
uma reconexão podem iniciar outra gravação. Esses testes não substituem a
validação com câmeras físicas da matriz acima.
Por segurança, os endereços Event Service e PullPoint anunciados pela câmera
devem usar o mesmo host do endpoint ONVIF configurado; câmeras que anunciam
outro host exigem validação específica de compatibilidade.

## Pré-buffer

O pré-buffer é limitado a 30 segundos e inicia em zero. Ao ativar movimento e
definir um valor maior que zero, cada câmera ativa ganha uma sessão RTSP
adicional que grava segmentos de 2 segundos em cache. No início do evento,
os segmentos do intervalo configurado são copiados para a biblioteca e
associados à gravação. O cache é limpo continuamente e limitado a 128 MB por
câmera; arquivos ainda em escrita podem ultrapassar o limite por um breve
período. O cache é apagado ao desativar a câmera, desligar o buffer ou encerrar
o aplicativo normalmente.

Isso consome rede, CPU, memória do processo MediaMTX e espaço temporário mesmo
sem eventos. Em caso de falha de energia ou encerramento abrupto, arquivos
temporários podem permanecer até o próximo início do buffer daquela câmera.
O intervalo efetivamente recuperado pode ser menor em caso de conexão instável,
armazenamento insuficiente ou ausência de suporte a eventos ONVIF. A gravação
manual/agendada não depende do buffer.
