# Referência RTSP para Câmeras IP, DVRs e NVRs

> Documento consolidado de endpoints RTSP conhecidos para câmeras IP, DVRs e NVRs.
>
> **Importante:** endpoints RTSP podem variar conforme **modelo, linha, OEM, firmware e região**. Não assuma que um endereço funciona para todos os equipamentos de uma mesma marca.

---

## Tabela-resumo RTSP

| Fabricante | Endpoint principal conhecido | Exemplo de URL RTSP | Confiança |
|---|---|---|---|
| TP-Link Tapo / C310 | `/stream1` e `/stream2` | `rtsp://USUARIO:SENHA@IP:554/stream1` | Alta / oficial |
| YooSee | `/onvif1` | `rtsp://admin:SENHA@IP:554/onvif1` | Médio/Alto / comunitário |
| Haiz | varia: `/ch0_0.h264`, `/stream_0`, etc. | `rtsp://USUARIO:SENHA@IP:554/ch0_0.h264` | Média por modelo; `/h264?channel=1` não confirmado |
| Intelbras | `/cam/realmonitor?channel=1&subtype=0` | `rtsp://USUARIO:SENHA@IP:554/cam/realmonitor?channel=1&subtype=0` | Alta |
| Intelbras Mibo | `/cam/realmonitor?...&unicast=true&proto=Onvif` | `rtsp://admin:CHAVE@IP:554/cam/realmonitor?channel=1&subtype=0&unicast=true&proto=Onvif` | Alta para modelos compatíveis |
| Hikvision | `/Streaming/Channels/101` | `rtsp://USUARIO:SENHA@IP:554/Streaming/Channels/101` | Alta |
| Axis | `/axis-media/media.amp` | `rtsp://USUARIO:SENHA@IP:554/axis-media/media.amp` | Alta |
| Foscam | `/videoMain` | `rtsp://USUARIO:SENHA@IP:554/videoMain` | Alta em linhas compatíveis |
| Vivotek | `/live.sdp` | `rtsp://USUARIO:SENHA@IP:554/live.sdp` | Alta, configurável |
| Hanwha | `/profile1/media.smp` | `rtsp://USUARIO:SENHA@IP:554/profile1/media.smp` | Alta |
| Luxvision | `/ch01/0` ou `user=...stream=...sdp` | `rtsp://USUARIO:SENHA@IP:554/ch01/0` | Média / depende do OEM |
| Tecvoz | Vários conforme linha | `rtsp://USUARIO:SENHA@IP:554/profile1` | Média/Alta por família |
| Giga | `user=...&stream=...sdp?real_stream` | `rtsp://USUARIO:SENHA@IP:554/user=USUARIO&password=SENHA&channel=1&stream=0.sdp?real_stream` | Média |
| Greatek | Vários conforme OEM | `rtsp://USUARIO:SENHA@IP:554/11` | Média/Baixa |
| D-Link | `/live1.sdp`, `/play1.sdp`, etc. | `rtsp://USUARIO:SENHA@IP:554/live1.sdp` | Média/Alta por modelo |
| GeoVision | `/CH001.sdp` | `rtsp://USUARIO:SENHA@IP:554/CH001.sdp` | Média |
| LG | `/Master-0` | `rtsp://USUARIO:SENHA@IP:554/Master-0` | Média |
| Multilaser | `/H264?ch=1&subtype=0` | `rtsp://USUARIO:SENHA@IP:554/H264?ch=1&subtype=0` | Média/Baixa |
| Zavio | `/video.pro1` | `rtsp://USUARIO:SENHA@IP:554/video.pro1` | Média |
| Ubiquiti | varia conforme geração | `rtsp://USUARIO:SENHA@IP:554/live/ch00_0` | Média/Alta por produto |

> **Nota:** os exemplos usam placeholders (`USUARIO`, `SENHA`, `IP`, `CHAVE`). Alguns endpoints variam por modelo, firmware, linha ou OEM; consulte as seções detalhadas antes de usar em produção.

---

## Sumário

- [1. Conceitos básicos](#1-conceitos-básicos)
- [2. Convenções usadas neste documento](#2-convenções-usadas-neste-documento)
- [3. Intelbras](#3-intelbras)
- [4. Intelbras Mibo](#4-intelbras-mibo)
- [5. Hikvision](#5-hikvision)
- [6. Axis](#6-axis)
- [7. Foscam](#7-foscam)
- [8. Vivotek](#8-vivotek)
- [9. Samsung Techwin / Hanwha Vision](#9-samsung-techwin--hanwha-vision)
- [10. Luxvision](#10-luxvision)
- [11. Tecvoz](#11-tecvoz)
- [12. Giga](#12-giga)
- [13. Greatek](#13-greatek)
- [14. D-Link](#14-d-link)
- [15. GeoVision](#15-geovision)
- [16. LG](#16-lg)
- [17. Multilaser](#17-multilaser)
- [18. UBNT / Ubiquiti](#18-ubnt--ubiquiti)
- [19. Zavio](#19-zavio)
- [20. Outros fabricantes e padrões históricos](#20-outros-fabricantes-e-padrões-históricos)
- [21. Endpoints genéricos / fallback](#21-endpoints-genéricos--fallback)
- [22. Endpoints que exigem cautela](#22-endpoints-que-exigem-cautela)
- [23. Como identificar o endpoint correto](#23-como-identificar-o-endpoint-correto)
- [24. Testando com VLC](#24-testando-com-vlc)
- [25. Testando com FFmpeg / ffprobe](#25-testando-com-ffmpeg--ffprobe)
- [26. Caracteres especiais em usuário e senha](#26-caracteres-especiais-em-usuário-e-senha)
- [27. RTSP sobre TCP e UDP](#27-rtsp-sobre-tcp-e-udp)
- [28. ONVIF](#28-onvif)
- [29. Segurança](#29-segurança)
- [Tabela-resumo RTSP](#tabela-resumo-rtsp)
- [31. Referências](#31-referências)

---

# 1. Conceitos básicos

RTSP significa **Real Time Streaming Protocol**.

Ele é normalmente utilizado para estabelecer sessões de streaming de vídeo e áudio em:

- câmeras IP;
- DVRs;
- NVRs;
- vídeo porteiros;
- câmeras Wi-Fi;
- sistemas de monitoramento;
- softwares VMS;
- aplicações de visão computacional.

O RTSP normalmente controla a sessão, enquanto o fluxo de mídia é transportado via RTP.

A porta RTSP mais comum é:

```text
554
```

Porém alguns fabricantes permitem alterar a porta ou utilizam portas diferentes em determinados modelos.

---

# 2. Convenções usadas neste documento

Os exemplos utilizam os seguintes placeholders:

| Placeholder | Significado |
|---|---|
| `USUARIO` | Usuário da câmera, DVR ou NVR |
| `SENHA` | Senha do usuário |
| `IP` | IP ou hostname do dispositivo |
| `PORTA` | Porta RTSP |
| `CHANNEL` | Número do canal |
| `STREAM` | Identificador do stream |

Exemplo:

```text
rtsp://USUARIO:SENHA@IP:PORTA/caminho
```

Exemplo real:

```text
rtsp://admin:minhasenha@192.168.1.100:554/cam/realmonitor?channel=1&subtype=0
```

> Não publique URLs reais contendo credenciais.

---

# 3. Intelbras

## Status

**Confirmado para diversas linhas Intelbras e equipamentos compatíveis com a API baseada em Dahua.**

## Endpoint ONVIF

Para equipamentos Intelbras compatíveis com ONVIF, um endpoint comum do Device Service é:

```text
http://IP:80/onvif/device_service
```

Exemplo:

```text
http://192.168.1.100:80/onvif/device_service
```

Em muitos casos, a porta HTTP padrão é `80`, mas ela pode ter sido alterada na configuração do equipamento.

Esse endpoint é utilizado por clientes ONVIF para acessar o **Device Service** e, a partir dele, consultar recursos como:

- informações do dispositivo;
- capabilities;
- perfis de mídia;
- eventos;
- PTZ, quando suportado;
- URIs de streaming via serviços Media/Media2.

> ONVIF e RTSP são serviços distintos. O endpoint `/onvif/device_service` não fornece diretamente o vídeo; ele permite que o cliente descubra e consulte os serviços do equipamento, incluindo o URI RTSP do perfil de mídia.

## Stream principal

```text
rtsp://USUARIO:SENHA@IP:554/cam/realmonitor?channel=1&subtype=0
```

## Stream secundário

```text
rtsp://USUARIO:SENHA@IP:554/cam/realmonitor?channel=1&subtype=1
```

Em equipamentos que suportam um terceiro perfil:

```text
subtype=2
```

pode representar um segundo substream.

## DVR/NVR — canal variável

```text
rtsp://USUARIO:SENHA@IP:554/cam/realmonitor?channel=CHANNEL&subtype=STREAM
```

Exemplos:

### Canal 1 — principal

```text
rtsp://admin:senha@192.168.1.10:554/cam/realmonitor?channel=1&subtype=0
```

### Canal 1 — secundário

```text
rtsp://admin:senha@192.168.1.10:554/cam/realmonitor?channel=1&subtype=1
```

### Canal 4 — principal

```text
rtsp://admin:senha@192.168.1.10:554/cam/realmonitor?channel=4&subtype=0
```

## Padrão alternativo/histórico

Alguns equipamentos OEM podem aceitar:

```text
rtsp://IP:PORTA/user=USUARIO&password=SENHA&channel=1&stream=0.sdp
```

ou:

```text
rtsp://IP:PORTA/user=USUARIO&password=SENHA&channel=1&stream=0.sdp?
```

Esse padrão deve ser tratado como **dependente de modelo/OEM**, e não como padrão Intelbras universal.

---

# 4. Intelbras Mibo

A família Mibo merece tratamento separado.

## Mibo Smart iM4 / iM4C

Um endpoint conhecido e utilizado em integração RTSP/ONVIF é:

```text
rtsp://admin:CHAVE_DE_ACESSO@IP:554/cam/realmonitor?channel=1&subtype=0&unicast=true&proto=Onvif
```

Stream secundário:

```text
rtsp://admin:CHAVE_DE_ACESSO@IP:554/cam/realmonitor?channel=1&subtype=1&unicast=true&proto=Onvif
```

### Observação importante

Em determinadas Mibo, a senha usada no acesso pode ser a **chave de acesso do dispositivo**, em vez da senha da conta do aplicativo Mibo.

O usuário costuma ser:

```text
admin
```

### Possíveis requisitos

- ONVIF habilitado;
- firmware compatível;
- câmera e cliente na mesma rede;
- porta RTSP acessível;
- chave de acesso correta.

---

# 5. Hikvision

## Status

**Confirmado.**

O padrão mais recomendado atualmente é:

```text
rtsp://USUARIO:SENHA@IP:554/Streaming/Channels/ID
```

O identificador normalmente segue:

```text
CHANNEL + STREAM
```

Na prática:

| ID | Significado |
|---|---|
| `101` | Canal 1, stream principal |
| `102` | Canal 1, substream |
| `201` | Canal 2, stream principal |
| `202` | Canal 2, substream |
| `301` | Canal 3, stream principal |
| `302` | Canal 3, substream |

## Canal 1 — principal

```text
rtsp://USUARIO:SENHA@IP:554/Streaming/Channels/101
```

## Canal 1 — secundário

```text
rtsp://USUARIO:SENHA@IP:554/Streaming/Channels/102
```

## Canal 2 — principal

```text
rtsp://USUARIO:SENHA@IP:554/Streaming/Channels/201
```

## Padrão legado

Alguns modelos e firmwares antigos utilizam:

```text
rtsp://USUARIO:SENHA@IP:554/h264/ch1/main/av_stream
```

Para substream, algumas gerações utilizam variações de:

```text
rtsp://USUARIO:SENHA@IP:554/h264/ch1/sub/av_stream
```

Recomenda-se priorizar `/Streaming/Channels/...`.

---

# 6. Axis

## Status

**Confirmado.**

Endpoint padrão:

```text
rtsp://USUARIO:SENHA@IP:554/axis-media/media.amp
```

Também pode ser utilizado sem credenciais embutidas na URL, deixando a autenticação para o cliente:

```text
rtsp://IP:554/axis-media/media.amp
```

Alguns dispositivos aceitam parâmetros adicionais:

```text
rtsp://IP:554/axis-media/media.amp?camera=1
```

ou:

```text
rtsp://IP:554/axis-media/media.amp?camera=2
```

dependendo do número de sensores/canais.

> Evite usar `videocodac=h264`. Além de ser uma grafia incorreta, esse parâmetro não faz parte do endpoint básico recomendado.

---

# 7. Foscam

## Status

**Confirmado para diversas câmeras HD Foscam.**

## Stream principal

```text
rtsp://USUARIO:SENHA@IP:PORTA/videoMain
```

## Stream secundário

```text
rtsp://USUARIO:SENHA@IP:PORTA/videoSub
```

## Somente áudio

Alguns modelos:

```text
rtsp://USUARIO:SENHA@IP:PORTA/audio
```

### Porta

A porta pode não ser 554 em todos os modelos.

Algumas câmeras Foscam antigas utilizaram a mesma porta configurada para serviços HTTP/RTSP ou portas como `88`.

Sempre confira a configuração do dispositivo.

---

# 8. Vivotek

## Status

**Confirmado, mas o nome do recurso pode ser configurável.**

Stream principal comum:

```text
rtsp://USUARIO:SENHA@IP:554/live.sdp
```

Segundo stream:

```text
rtsp://USUARIO:SENHA@IP:554/live2.sdp
```

Em alguns modelos, o nome do endpoint RTSP é configurável no firmware.

Portanto:

```text
/live.sdp
```

não deve ser considerado universal para todos os produtos Vivotek.

---

# 9. Samsung Techwin / Hanwha Vision

A antiga linha Samsung Techwin atualmente pertence à **Hanwha Vision**.

## Câmeras IP

Formato conhecido:

```text
rtsp://USUARIO:SENHA@IP:554/profile1/media.smp
```

Segundo perfil:

```text
rtsp://USUARIO:SENHA@IP:554/profile2/media.smp
```

Perfis adicionais podem existir:

```text
/profile3/media.smp
/profile4/media.smp
```

## NVR

Em determinados NVRs Hanwha:

```text
rtsp://USUARIO:SENHA@IP:554/LiveChannel/0/media.smp
```

Os identificadores podem começar em `0`.

> Não presuma que o endpoint de câmera IP e o de NVR sejam iguais.

---

# 10. Luxvision

A Luxvision comercializou equipamentos de diferentes plataformas/OEMs.

Por isso há mais de um padrão válido.

## Câmera IP — padrão conhecido

```text
rtsp://USUARIO:SENHA@IP:554/ch01/0
```

Possível substream:

```text
rtsp://USUARIO:SENHA@IP:554/ch01/1
```

## DVR — padrão conhecido

```text
rtsp://USUARIO:SENHA@IP:554/user=USUARIO&password=SENHA&channel=CHANNEL&stream=STREAM.sdp
```

Exemplo:

```text
rtsp://admin:senha@192.168.1.20:554/user=admin&password=senha&channel=1&stream=0.sdp
```

Em algumas listas antigas aparece sem credenciais antes do host:

```text
rtsp://IP:554/user=USUARIO&password=SENHA&channel=1&stream=0.sdp
```

Também existem equipamentos com endpoints como:

```text
/ch01.264
/ch02/0
```

Portanto a Luxvision deve ser cadastrada por **modelo/família**, e não com uma única URL universal.

---

# 11. Tecvoz

A Tecvoz utiliza diferentes padrões conforme a linha.

## Linha TW — câmera IP

```text
rtsp://USUARIO:SENHA@IP:PORTA/profile1
```

## Linha TW — DVR/NVR

Padrão conhecido:

```text
rtsp://USUARIO:SENHA@IP:PORTA/chID=1&streamType=main&linkType=tcpa
```

## Linha T1 / THK — DVR/NVR

```text
rtsp://USUARIO:SENHA@IP:PORTA/Streaming/Channels/101
```

ou, conforme o canal:

```text
rtsp://USUARIO:SENHA@IP:PORTA/Streaming/Channels/CHANNEL01
```

## Linha T1 / THK — câmera

```text
rtsp://USUARIO:SENHA@IP:PORTA/Streaming/Channels/101
```

## Linha ICB

Padrão histórico:

```text
rtsp://USUARIO:SENHA@IP:PORTA/mode=real&idc=1&ids=1
```

## TW-ICB

Outro padrão encontrado:

```text
rtsp://USUARIO:SENHA@IP:PORTA/profile1
```

> Os padrões Tecvoz devem ser vinculados à linha/modelo.

---

# 12. Giga

A Giga utilizou diferentes plataformas.

Um padrão comum em equipamentos antigos:

```text
rtsp://USUARIO:SENHA@IP:PORTA/user=USUARIO&password=SENHA&channel=CHANNEL&stream=STREAM.sdp?real_stream
```

ou:

```text
rtsp://IP:PORTA/user=USUARIO&password=SENHA&channel=CHANNEL&stream=STREAM.sdp?real_stream
```

Existem equipamentos em que:

```text
stream=0
```

é o principal.

Em outros:

```text
stream=1
```

é o principal.

Portanto **não fixe o número do stream sem conhecer o modelo**.

### Atenção a HTML copiado

Errado:

```text
user=admin&amp;password=1234
```

Correto:

```text
user=admin&password=1234
```

---

# 13. Greatek

Endpoints encontrados em equipamentos Greatek incluem:

```text
rtsp://IP:PORTA/user=USUARIO&password=SENHA&channel=1&stream=0.sdp
```

e, para algumas câmeras:

```text
rtsp://USUARIO:SENHA@IP:PORTA/11
```

ou:

```text
rtsp://USUARIO:SENHA@IP:PORTA/12
```

Esses padrões são **dependentes de modelo/OEM**.

---

# 14. D-Link

A D-Link possui diversos endpoints conforme o modelo.

## DCS-7010L e semelhantes

```text
rtsp://USUARIO:SENHA@IP:PORTA/live1.sdp
```

Substream:

```text
rtsp://USUARIO:SENHA@IP:PORTA/live2.sdp
```

## DCS-942L e semelhantes

```text
rtsp://USUARIO:SENHA@IP:PORTA/play1.sdp
```

Segundo stream:

```text
rtsp://USUARIO:SENHA@IP:PORTA/play2.sdp
```

Outros modelos utilizam:

```text
/video1.sdp
/video2.sdp
```

Sempre verifique o manual específico.

---

# 15. GeoVision

## Câmeras IP

Padrão conhecido:

```text
rtsp://USUARIO:SENHA@IP:PORTA/CH001.sdp
```

Segundo stream:

```text
rtsp://USUARIO:SENHA@IP:PORTA/CH002.sdp
```

## GV-800 e sistemas semelhantes

Formato encontrado:

```text
rtsp://USUARIO:SENHA@IP:PORTA/camCHANNEL_streamSTREAM
```

Exemplo:

```text
rtsp://admin:senha@192.168.1.50:554/cam1_stream1
```

---

# 16. LG

Padrão conhecido para determinadas câmeras:

```text
rtsp://USUARIO:SENHA@IP:PORTA/Master-0
```

Em outras linhas:

```text
rtsp://USUARIO:SENHA@IP:PORTA/master-0
```

Substream:

```text
rtsp://USUARIO:SENHA@IP:PORTA/slave-0
```

A diferenciação pode ser case-sensitive em alguns servidores.

---

# 17. Multilaser

Endpoint conhecido para alguns equipamentos:

```text
rtsp://USUARIO:SENHA@IP:PORTA/H264?ch=1&subtype=0
```

Substream:

```text
rtsp://USUARIO:SENHA@IP:PORTA/H264?ch=1&subtype=1
```

Tratar como padrão dependente de modelo.

---

# 18. UBNT / Ubiquiti

Padrão histórico para determinadas câmeras airCam/UniFi Video:

```text
rtsp://USUARIO:SENHA@IP:PORTA/live/ch00_0
```

ou:

```text
rtsp://USUARIO:SENHA@IP:PORTA/live/ch01_0
```

Produtos UniFi Protect atuais podem gerar URLs RTSP/RTSPS diretamente na interface do controlador.

Em ambientes Protect, prefira sempre copiar o endpoint gerado pelo próprio sistema.

---

# 19. Zavio

Para alguns modelos, como B-5111:

```text
rtsp://USUARIO:SENHA@IP:PORTA/video.pro1
```

Segundo stream:

```text
rtsp://USUARIO:SENHA@IP:PORTA/video.pro2
```

---

# 20. Outros fabricantes e padrões históricos

## YooSee

### Status

**Validado por documentação técnica comunitária / engenharia reversa. Não localizado, até esta revisão, em documentação oficial pública da YooSee.**

Endpoint RTSP conhecido:

```text
rtsp://admin:SENHA@IP:554/onvif1
```

Exemplo:

```text
rtsp://admin:minhasenha@192.168.1.120:554/onvif1
```

Observações:

- o usuário costuma ser `admin`;
- a porta RTSP normalmente é `554`;
- `/onvif1` é um nome de recurso usado por várias câmeras baseadas na plataforma YooSee;
- o fato do caminho se chamar `/onvif1` **não significa que ele seja definido pelo padrão ONVIF**;
- firmware, placa/OEM e versão da câmera podem alterar o endpoint;
- há câmeras vendidas sob outras marcas que internamente utilizam plataforma YooSee.

Nível de confiança:

```text
Médio/Alto para câmeras YooSee compatíveis
```

> Recomenda-se confirmar via ONVIF ou testar com `ffprobe`/VLC antes de cadastrar o endpoint de forma permanente.

---

## Haiz

### Status

**Suporte a RTSP e ONVIF confirmado oficialmente em equipamentos Haiz, mas o endpoint abaixo não foi validado como padrão universal da marca.**

Endpoint informado:

```text
rtsp://USUARIO:SENHA@IP:554/h264?channel=1
```

Até esta revisão, **não foi localizada documentação oficial Haiz confirmando `/h264?channel=1` como URL RTSP padrão**.

Por isso, esse endereço deve ser mantido apenas como:

```text
fallback / endpoint legado / dependente de modelo
```

### Endpoints conhecidos em modelos Haiz

Bases comunitárias atuais registram, conforme modelo/OEM, caminhos como:

```text
/ch0_0.h264
/ch0_1.h264
/stream_0
/stream_1
/0
/11
```

Exemplos:

```text
rtsp://USUARIO:SENHA@IP:554/ch0_0.h264
rtsp://USUARIO:SENHA@IP:554/ch0_1.h264
```

e:

```text
rtsp://USUARIO:SENHA@IP:554/stream_0
rtsp://USUARIO:SENHA@IP:554/stream_1
```

### O que é oficialmente confirmado

A documentação Haiz confirma, em equipamentos compatíveis:

- suporte a RTSP;
- autenticação RTSP configurável;
- suporte a ONVIF;
- modelos com ONVIF Profile S;
- porta RTSP `554` em determinados equipamentos.

Além disso, a própria Haiz comercializa diferentes famílias e plataformas. Alguns produtos usam, por exemplo:

- Haiz Vision;
- XMEye/XMEye Pro;
- ICSee;
- YooSee.

Isso reforça que **não existe um único endpoint RTSP seguro para toda a marca Haiz**.

### Recomendação

Para integração:

```text
1. identificar o modelo exato;
2. consultar ONVIF/GetStreamUri;
3. testar os endpoints documentados para aquela família;
4. só então tentar /h264?channel=1 como fallback.
```

Nível de confiança para `/h264?channel=1`:

```text
Baixo / não confirmado como padrão Haiz
```

Nível de confiança para suporte RTSP/ONVIF:

```text
Alto
```

---

## TP-Link Tapo

### Status

**Confirmado oficialmente pela TP-Link.**

A maioria das câmeras Tapo cabeadas compatíveis utiliza:

### Stream principal / alta qualidade

```text
rtsp://USUARIO:SENHA@IP:554/stream1
```

### Stream secundário / qualidade padrão

```text
rtsp://USUARIO:SENHA@IP:554/stream2
```

A TP-Link também documenta as formas sem credenciais embutidas:

```text
rtsp://IP:554/stream1
rtsp://IP:554/stream2
```

Nesse caso, o software cliente solicita ou recebe as credenciais separadamente.

### Tapo C310

Para a **TP-Link Tapo C310**, os endpoints são oficialmente suportados:

```text
rtsp://USUARIO:SENHA@IP:554/stream1
```

Fluxo principal:

```text
stream1
```

Fluxo secundário:

```text
rtsp://USUARIO:SENHA@IP:554/stream2
```

A qualidade efetiva do `stream1` na C310 depende da qualidade de vídeo configurada no aplicativo Tapo.

### Credenciais

As credenciais RTSP/ONVIF **não são necessariamente as mesmas credenciais da conta TP-Link/Tapo**.

É necessário criar/configurar uma **Conta da Câmera** no aplicativo Tapo para integrações de terceiros.

Fluxo conceitual:

```text
App Tapo
   ↓
Configurações da câmera
   ↓
Conta da Câmera
   ↓
Criar usuário/senha
   ↓
Usar essas credenciais no RTSP/ONVIF
```

### Portas oficiais

```text
RTSP: 554
ONVIF: 2020
```

### ONVIF

As câmeras Tapo compatíveis oferecem:

```text
ONVIF Profile S
```

### Observações

Nem toda câmera Tapo suporta RTSP. Modelos alimentados exclusivamente por bateria frequentemente não disponibilizam streaming RTSP contínuo.

Para a C310, o suporte é confirmado.

Nível de confiança:

```text
Alto / documentação oficial TP-Link
```

---

Os endpoints abaixo aparecem em bases antigas e integrações de mercado.

Eles devem ser tratados como **modelo/OEM específico**.

## Alive

```text
rtsp://IP:PORTA/user=USUARIO&password=SENHA&channel=1&stream=0.sdp?real_stream
```

Outro padrão:

```text
rtsp://USUARIO:SENHA@IP:PORTA/1
```

ou:

```text
rtsp://USUARIO:SENHA@IP:PORTA/2
```

---

## Clear

```text
rtsp://IP:PORTA/user=USUARIO&password=SENHA&channel=1&stream=0.sdp
```

---

## Dahua

O padrão atual mais conhecido é:

```text
rtsp://USUARIO:SENHA@IP:554/cam/realmonitor?channel=1&subtype=0
```

Principal:

```text
subtype=0
```

Secundário:

```text
subtype=1
```

Existem URLs antigas:

```text
rtsp://IP:PORTA/user=USUARIO&password=SENHA&channel=1&stream=0.sdp
```

mas o padrão `cam/realmonitor` deve ser preferido.

---

## HDL

```text
rtsp://IP:PORTA/user=USUARIO&password=SENHA&channel=1&stream=0.sdp
```

---

## JFL

Alguns modelos utilizaram estrutura semelhante à Hikvision:

```text
rtsp://USUARIO:SENHA@IP:PORTA/h264/ch1/main/av_stream
```

Não considerar universal.

---

## Jortan

```text
rtsp://IP:PORTA/user=USUARIO&password=SENHA&channel=1&stream=0.sdp
```

---

## Ivio

```text
rtsp://USUARIO:SENHA@IP:PORTA/user=USUARIO&password=SENHA&channel=CHANNEL&stream=STREAM.sdp?
```

---

## Venetian

```text
rtsp://USUARIO:SENHA@IP:PORTA/user=USUARIO&password=SENHA&channel=CHANNEL&stream=STREAM.sdp
```

Em alguns equipamentos OEM também aparece:

```text
rtsp://USUARIO:SENHA@IP:PORTA/cam/realmonitor?channel=1&subtype=0&unicast=true&proto=Onvif
```

---

## ControlBR

```text
rtsp://USUARIO:SENHA@IP:PORTA/user=USUARIO&password=SENHA&channel=CHANNEL&stream=STREAM.sdp?
```

---

## PowerTech

Padrões simples encontrados:

```text
rtsp://USUARIO:SENHA@IP:PORTA/0
```

ou:

```text
rtsp://USUARIO:SENHA@IP:PORTA/1
```

---

## ProImage

Padrão semelhante:

```text
rtsp://USUARIO:SENHA@IP:PORTA/0
```

ou:

```text
rtsp://USUARIO:SENHA@IP:PORTA/1
```

---

## MTW

Endpoint conhecido:

```text
rtsp://USUARIO:SENHA@IP:PORTA/live
```

A distinção entre perfis depende do modelo.

---

# 21. Endpoints genéricos / fallback

Os endpoints abaixo podem ser usados como **tentativas de descoberta**, mas não são definidos pelo padrão RTSP como URLs universais.

## Raiz do servidor

```text
rtsp://USUARIO:SENHA@IP:554/
```

ou:

```text
rtsp://USUARIO:SENHA@IP:554
```

## H.264 genérico

```text
rtsp://USUARIO:SENHA@IP:554/h264?channel=1
```

## Padrão OEM antigo

```text
rtsp://IP:554/user=USUARIO&password=SENHA&channel=1&stream=0.sdp
```

## Endpoint chamado "onvif1"

```text
rtsp://USUARIO:SENHA@IP:554/onvif1
```

> `/onvif1` não é um endpoint definido pelo padrão ONVIF. É apenas uma convenção adotada por alguns fabricantes/OEMs.

---

# 22. Endpoints que exigem cautela

## Herospeed `/snap.jpg`

Foi encontrada a seguinte entrada em listas antigas:

```text
rtsp://USUARIO:SENHA@IP:PORTA/snap.jpg
```

Ela é **suspeita como endpoint RTSP**.

A extensão:

```text
.jpg
```

normalmente indica um endpoint de snapshot JPEG.

Portanto não deve ser mantida como RTSP genérico sem documentação específica do modelo.

---

## AvTech — URL duplicada

Algumas listas possuem algo semelhante a:

```text
rtsp://USER:PASS@IP:PORT://USER:PASS@IP:PORT/live/h264/STREAM
```

Isso é claramente uma concatenação incorreta.

Um endpoint AvTech válido depende do modelo e deve ser confirmado em documentação específica.

---

# 23. Como identificar o endpoint correto

Quando o fabricante/modelo não está documentado, utilize esta sequência.

## 1. Descubra o IP

Exemplos:

```bash
arp -a
```

ou:

```bash
ip neigh
```

Ferramentas como Advanced IP Scanner também podem ajudar.

---

## 2. Descubra as portas

Exemplo com Nmap:

```bash
nmap -sV 192.168.1.100
```

Para portas mais comuns:

```bash
nmap -p 80,443,554,8000,8080,8899 192.168.1.100
```

> Faça varreduras apenas em redes e dispositivos que você administra ou tem autorização para testar.

---

## 3. Procure a porta RTSP

A mais comum:

```text
554/tcp
```

Mas outras são possíveis.

---

## 4. Verifique ONVIF

Se o equipamento suporta ONVIF, um cliente ONVIF normalmente consegue consultar o URI do perfil de mídia.

Isso é preferível a tentar dezenas de URLs manualmente.

---

## 5. Consulte o modelo exato

Exemplo:

```text
Hikvision DS-2CD2143G2-I RTSP
```

é muito mais confiável do que pesquisar apenas:

```text
Hikvision RTSP
```

---

# 24. Testando com VLC

Abra:

```text
Mídia → Abrir Fluxo de Rede
```

Informe:

```text
rtsp://USUARIO:SENHA@IP:554/...
```

Também é possível iniciar via terminal:

```bash
vlc 'rtsp://USUARIO:SENHA@IP:554/cam/realmonitor?channel=1&subtype=0'
```

---

# 25. Testando com FFmpeg / ffprobe

## ffplay

```bash
ffplay 'rtsp://USUARIO:SENHA@IP:554/cam/realmonitor?channel=1&subtype=0'
```

## Forçando RTSP sobre TCP

```bash
ffplay -rtsp_transport tcp 'rtsp://USUARIO:SENHA@IP:554/cam/realmonitor?channel=1&subtype=0'
```

## ffprobe

```bash
ffprobe -rtsp_transport tcp 'rtsp://USUARIO:SENHA@IP:554/cam/realmonitor?channel=1&subtype=0'
```

## FFmpeg

```bash
ffmpeg \
  -rtsp_transport tcp \
  -i 'rtsp://USUARIO:SENHA@IP:554/cam/realmonitor?channel=1&subtype=0' \
  -c copy \
  -t 30 \
  teste.mp4
```

Isso grava aproximadamente 30 segundos sem recodificar, quando os codecs são compatíveis com o container.

---

# 26. Caracteres especiais em usuário e senha

Credenciais dentro da URL precisam respeitar URL encoding.

Por exemplo, se a senha for:

```text
abc@123
```

o `@` pode quebrar a URL.

Use:

```text
abc%40123
```

Alguns caracteres comuns:

| Caractere | Encoding |
|---|---|
| `@` | `%40` |
| `:` | `%3A` |
| `/` | `%2F` |
| `#` | `%23` |
| `?` | `%3F` |
| `%` | `%25` |
| espaço | `%20` |

Exemplo:

```text
Senha original:
Minha@Senha:123

URL encoded:
Minha%40Senha%3A123
```

---

# 27. RTSP sobre TCP e UDP

RTSP pode negociar RTP sobre UDP ou TCP.

## UDP

Pode oferecer menor latência.

Porém costuma apresentar mais problemas com:

- NAT;
- firewall;
- Wi-Fi instável;
- roteamento;
- perda de pacotes.

## TCP

Normalmente é mais confiável:

```bash
ffplay -rtsp_transport tcp URL
```

Para sistemas de monitoramento, reconhecimento facial e ingestão contínua, TCP costuma ser uma boa primeira opção.

---

# 28. ONVIF

ONVIF não é sinônimo de RTSP.

ONVIF define serviços padronizados para:

- descoberta;
- autenticação;
- profiles;
- configuração;
- eventos;
- PTZ;
- media;
- consulta de URIs.

Um dispositivo ONVIF pode fornecer via API o endereço RTSP correto de determinado perfil.

Esse método é preferível quando disponível.

Fluxo conceitual:

```text
Descoberta ONVIF
       ↓
Device Service
       ↓
Media / Media2
       ↓
GetProfiles
       ↓
GetStreamUri
       ↓
RTSP URL
```

---

# 29. Segurança

## Nunca exponha RTSP diretamente à Internet sem necessidade

Evite redirecionar:

```text
TCP/554
```

diretamente no roteador.

Isso aumenta significativamente a superfície de ataque.

Prefira:

- VPN;
- WireGuard;
- Tailscale;
- ZeroTier;
- rede privada;
- VLAN de CFTV;
- firewall;
- proxy/gateway controlado.

---

## Nunca mantenha credenciais padrão

Evite:

```text
admin / admin
admin / 12345
admin / 123456
```

Use senhas exclusivas.

---

## Crie usuário somente-leitura

Quando o equipamento permitir, crie um usuário exclusivo para streaming.

Exemplo conceitual:

```text
Usuário: viewer
Permissões:
  - Live View: SIM
  - Playback: opcional
  - Configuração: NÃO
  - Administração: NÃO
```

---

## Não exponha credenciais em logs

Evite registrar:

```text
rtsp://admin:minhasenha@192.168.1.100:554/...
```

Prefira:

```text
rtsp://admin:***@192.168.1.100:554/...
```

---

# 30. Tabela-resumo

> A tabela-resumo foi movida para o início deste documento.

---

# 31. Referências

Fontes úteis para validação e descoberta:

- TP-Link Tapo — documentação oficial RTSP/ONVIF:
  - https://www.tp-link.com/br/support/faq/2680/
  - https://www.tp-link.com/br/support/faq/4465/

- HAIZ — documentação/site oficial:
  - https://haiz.ai/
  - https://haiz.ai/manual/manual_cam_web_haiz_vision.pdf

- YooSee — documentação técnica comunitária:
  - https://github.com/victorbillyph/Yoosee-camera-documentation

- iSpyConnect / Agent DVR — base comunitária de endpoints Haiz:
  - https://www.ispyconnect.com/camera/haiz

- Intelbras — manuais e documentação oficial:
  - https://www.intelbras.com/
  - https://manuais.intelbras.com.br/

- Fórum oficial Intelbras:
  - https://forum.intelbras.com.br/

- Hikvision:
  - https://www.hikvision.com/

- Axis:
  - https://help.axis.com/

- Foscam:
  - https://www.foscam.com/

- Vivotek:
  - https://www.vivotek.com/

- Hanwha Vision:
  - https://support.hanwhavision.com/

- iSpyConnect:
  - https://www.ispyconnect.com/

- Security.World:
  - https://security.world/

- SoleraTec — lista histórica:
  - https://www.soleratec.com/support/rtsp/

---

# Estrutura recomendada para uso em software

Em vez de cadastrar apenas:

```text
fabricante → URL
```

utilize:

```text
fabricante
  └── linha/modelo
       ├── padrão RTSP
       ├── stream principal
       ├── stream secundário
       ├── porta padrão
       ├── autenticação
       ├── ONVIF
       ├── nível de confiança
       └── fonte
```

Exemplo em YAML:

```yaml
intelbras:
  dahua_compatible:
    rtsp:
      template: "rtsp://{user}:{password}@{host}:{port}/cam/realmonitor?channel={channel}&subtype={stream}"
      main_stream: 0
      sub_stream: 1
      default_port: 554
    confidence: high

  mibo_im4c:
    rtsp:
      template: "rtsp://admin:{access_key}@{host}:554/cam/realmonitor?channel={channel}&subtype={stream}&unicast=true&proto=Onvif"
      main_stream: 0
      sub_stream: 1
      default_port: 554
    auth:
      username: admin
      password_type: access_key
    confidence: high

hikvision:
  standard:
    rtsp:
      template: "rtsp://{user}:{password}@{host}:{port}/Streaming/Channels/{channel}{stream_id}"
      main_stream_id: "01"
      sub_stream_id: "02"
      default_port: 554
    confidence: high
```

---

# Conclusão

Não existe um único endpoint RTSP universal.

Mesmo dentro de uma mesma marca, podem existir:

- diferentes OEMs;
- diferentes firmwares;
- diferentes gerações de hardware;
- DVRs e câmeras com stacks diferentes;
- endpoints legados;
- endpoints configuráveis.

A ordem recomendada para integração é:

```text
1. Consultar documentação do modelo
2. Utilizar ONVIF/GetStreamUri quando disponível
3. Utilizar padrão conhecido do fabricante
4. Testar padrões alternativos da mesma família/OEM
5. Utilizar fallbacks genéricos apenas como último recurso
```

Para aplicações de produção, mantenha os endpoints associados ao **modelo ou família do equipamento**, e não apenas ao nome do fabricante.