# Validação autenticada da Intelbras iM4-C

Data: 2026-10-03. Unidade física cadastrada no DVR, consultada com as credenciais
salvas de ONVIF e RTSP. Banco aberto somente para leitura, senha utilizada em
memória, sem exposição em logs. Nenhuma configuração ou gravação foi alterada.

| Verificação | Resultado |
| --- | --- |
| Identidade (`GetDeviceInformation`) | HTTP 200; fabricante `IntelBras`, modelo `iM4-C`. |
| Firmware | `2.800.00IB007.0.R 2026-08-04`. |
| Serviços (`GetServices`) | HTTP 200; Device, Analytics, Imaging, Media, PTZ, Events e DeviceIO. |
| Histórico ONVIF | Recording, Search e Replay não anunciados. |
| Capacidades de Media/PTZ | HTTP 200. |
| Perfis (`GetProfiles`) | HTTP 200; dois perfis H.264: 1920 × 1080 a 20 fps e 640 × 480 a 15 fps. |
| Áudio | `AudioEncoderConfiguration` ausente nos dois perfis. Não prova ausência de áudio no RTSP. |
| PTZ | Após a correção, `detect()` retorna `ptzSupported: true`; não foram enviados comandos de movimento. |
| RTSP principal autenticado | `ok` no probe do aplicativo. Reprodução contínua não testada. |
| URIs de stream e snapshot via ONVIF | Após a correção, `GetStreamUri` e `GetSnapshotUri` retornam HTTP 200 e URI para ambos os perfis. Conteúdo do snapshot não foi baixado. |
| Presets PTZ (`GetPresets`) | HTTP 200 com falha SOAP: `This optional method is not implemented`. Presets não confirmados nesse firmware. |

## Defeito identificado durante o teste

A resposta XML foi analisada diretamente pelo parser do projeto, com o limite
original de profundidade 14, e os dois perfis foram encontrados. No adaptador,
`fetchProfiles` usava `queryText(audioEncoder ?? ({} as XmlNode), "Encoding")`.
Quando a configuração de áudio está ausente, o objeto vazio não contém
`children`; `queryText` lança `Cannot read properties of undefined (reading 'find')`.
O `catch` retorna uma lista vazia, ocultando vídeo e PTZ e impedindo as consultas
de URI posteriores. O erro também foi reproduzido localmente sem acessar a câmera.

A correção consulta os encoders somente quando presentes, mantendo os campos
ausentes como `null`. A regressão reproduziu a falha antes da correção e passou
depois: dois perfis preservados, PTZ detectado, URIs consultadas e comandos
`ContinuousMove`/`Stop` enviados ao serviço PTZ com o token real do perfil.
O teste também cobre ausência do encoder de vídeo, sem descartar o perfil.

A nova consulta autenticada à unidade física confirmou os dois perfis no
adaptador, `audioCodec: null`, PTZ suportado e as quatro consultas de URI
bem-sucedidas. A falha opcional de presets não impede a conexão do controlador,
mas pode aparecer no painel; não demonstra falha dos comandos de movimento.

Verificação local: 73 testes gerais e 15 de banco passaram, assim como lint,
typecheck, build e o script isolado de PTZ/Events. O script PTZ foi corrigido
para compilar o adaptador isoladamente, sem importar o ponto de entrada Electron.

Depois de reiniciar a versão atualizada do aplicativo, usar **Testar conexão**
na lista de câmeras para atualizar as capacidades persistidas da Intelbras.
Testar somente dentro do formulário de edição não atualiza essas capacidades.

## Limites do resultado

Autenticação, identidade e resposta dos perfis foram verificadas fisicamente.
Não foram testados áudio efetivo, sincronismo, PTZ em movimento, snapshots,
gravação, listagem ou importação do microSD nesta rodada. O adaptador Mibo do
projeto usa a API local específica, e não os serviços de histórico ONVIF; a
ausência desses serviços não determina o funcionamento desse adaptador.
