# Avaliação de cartão SD por ONVIF Profile G

Data: 2026-09-30.

Uma credencial especifica do cartao SD pode ser salva de forma cifrada em um
servico separado. Sem ela, a credencial ONVIF cifrada continua como fallback.

## Evidência disponível no aplicativo

Durante o teste ONVIF, o aplicativo consulta os serviços de **Recording**,
**Search** e **Replay** e somente marca `Busca e replay ONVIF` como disponível
quando os três endereços são anunciados pela câmera. Os endereços são
persistidos sem credenciais; o acesso reutiliza a credencial ONVIF cifrada.

A biblioteca ONVIF já instalada declara suporte a Profile G e oferece as
operações `getRecordings` e `getReplayUri`. Elas permitem identificar
gravações e solicitar uma URI RTSP de reprodução. A implementação instalada
não expõe uma operação de busca temporal que produza, de maneira interoperável,
os itens necessários para a aba Cartão SD: início, fim, tamanho, identificador
de download e arquivo importável.

## Decisão atual

Não existe adaptador genérico Profile G ativo. A presença dos três serviços
não é prova de que o histórico pode ser enumerado por dia ou importado em MP4;
câmeras e NVRs podem anunciar apenas parte da especificação ou devolver replay
em formatos/protocolos incompatíveis com a biblioteca local.

O adaptador Intelbras Mibo iM4-C permanece o único fluxo validado. Um novo
adaptador será habilitado somente quando um modelo e firmware físicos forem
testados para:

- busca por uma data específica e fuso horário da câmera;
- autenticação local e reutilização segura das credenciais;
- download ou replay que possa ser convertido/importado sem expor dados fora
  da biblioteca;
- duração, limite de tamanho, cancelamento e recuperação de arquivo parcial;
- reprodução final e prevenção de importações duplicadas.

Esta avaliação não anuncia compatibilidade para Tapo C200 ou qualquer outro
modelo.
