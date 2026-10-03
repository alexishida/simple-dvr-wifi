# Compatibilidade de áudio

Data da revisão: 2026-10-03.

O aplicativo recebe o vídeo ao vivo por WHEP/WebRTC e grava a fonte RTSP pelo
MediaMTX. A opção de ouvir, o volume e o mute pertencem somente ao elemento de
reprodução da interface: eles não são enviados ao processo de gravação. Assim,
silenciar uma câmera não remove a faixa de áudio de uma gravação em andamento.

## Estratégia atual

Não há conversão de áudio no aplicativo nesta versão. A faixa é mantida em
passagem direta (copy/remux) quando o MediaMTX e o contêiner fMP4 a suportam.
Isso evita carga de CPU adicional e mantém o áudio disponível nas gravações
manual, agendada e por movimento, inclusive no pré-buffer, pois todos usam a
mesma configuração de sessão de mídia.

| Fonte RTSP / gravação fMP4 | Ao vivo no WHEP/WebRTC | Decisão |
| --- | --- | --- |
| Opus | Suportado pelo MediaMTX; suporte do navegador é negociado | Passagem direta |
| AAC (MPEG-4 Audio) | Preservado na gravação; pode não ser negociado pelo WHEP | Passagem direta para gravação; áudio ao vivo indisponível se não houver negociação |
| G.711 PCMA/PCMU | Suportado pelo MediaMTX; suporte do navegador é negociado | Passagem direta |
| G.722 | Disponível ao vivo se negociado; não declarado na matriz fMP4 | Não prometer gravação até validação física |
| MP3, AC-3 ou LPCM | Preservados pelo fMP4 | Passagem direta na gravação; áudio ao vivo depende da negociação |
| Outro ou não anunciado | Não presumido | Vídeo segue sem interrupção; registrar a limitação |

O player pede uma faixa de áudio opcional, começa silenciado e mostra o codec
negociado quando a resposta SDP o informa. A ausência de faixa ou uma negociação
incompatível não bloqueia o vídeo. A exportação de trechos mapeia a primeira faixa
de áudio de forma opcional, preservando-a quando o segmento de origem a contém.

## Conversão e limites

Conversão não é habilitada automaticamente. Ela exigirá um binário FFmpeg
aprovado para redistribuição, uma política explícita de codec de saída e um
orçamento medido de CPU/memória por câmera. Enquanto isso não ocorrer, não há
conversões simultâneas a limitar: o limite é zero. Uma câmera cujo áudio não possa
ser negociado ao vivo continua apta a gravar sua faixa compatível em fMP4.

## Evidências e validação pendente

MediaMTX documenta suporte de gravação fMP4 para Opus, AAC, MP3, AC-3, G.711 e
LPCM, e suporte WHEP para Opus, G.722 e G.711. Consulte a documentação oficial:
[gravação](https://mediamtx.org/docs/features/record) e
[leitura WebRTC](https://mediamtx.org/docs/read/webrtc).

Esta matriz é uma expectativa de pipeline, não uma certificação de modelo. Ainda
é necessário testar em câmeras físicas presença e codec efetivos, sincronismo,
reconexão, troca de stream, continuidade entre segmentos e reprodução dos
arquivos exportados. Registre modelo, firmware, codec, navegador e hardware em
cada validação.
