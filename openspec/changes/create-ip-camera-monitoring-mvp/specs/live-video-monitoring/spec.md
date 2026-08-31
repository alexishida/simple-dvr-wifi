## Purpose

Entregar vídeo ao vivo de baixa latência para uma ou várias câmeras, adaptando qualidade e consumo aos recursos disponíveis sem depender de RTSP direto no Chromium.

## ADDED Requirements

### Requirement: Reprodução ao vivo compatível
O sistema SHALL transformar, encaminhar ou empacotar streams RTSP/RTP/RTCP em uma forma reproduzível pela interface, sem depender de suporte direto do elemento de vídeo do Chromium a RTSP.

#### Scenario: Stream H.264 por RTSP
- **WHEN** o usuário abre uma câmera com stream RTSP H.264 válido
- **THEN** o vídeo aparece dentro do aplicativo com áudio, quando suportado, e estado de conexão correspondente

### Requirement: Estratégia de codec eficiente
O sistema SHALL priorizar reprodução sem conversão, depois remux e somente então transcodificação; H.265 SHALL ser convertido apenas quando não houver caminho de reprodução compatível e MJPEG SHALL ser aceito quando fornecido.

#### Scenario: H.265 não reproduzível nativamente
- **WHEN** a plataforma não consegue reproduzir o perfil H.265 selecionado
- **THEN** o sistema usa fallback compatível quando disponível, informa o custo adicional e não presume suporte universal

### Requirement: Baixa latência e buffers limitados
O sistema SHALL configurar o caminho de mídia para monitoramento em tempo real, evitando buffers excessivos e liberando dados antigos em vez de aumentar latência indefinidamente.

#### Scenario: Consumidor visual temporariamente lento
- **WHEN** a interface não acompanha momentaneamente a taxa do stream
- **THEN** o pipeline limita o buffer e volta ao conteúdo atual sem crescimento contínuo de memória

### Requirement: Grid de múltiplas câmeras
O sistema SHALL oferecer layouts de 1, 4, 9 e 16 áreas de vídeo, cada uma com nome, vídeo, estado, indicador de gravação, fullscreen, snapshot e atalhos compatíveis com a câmera.

#### Scenario: Layout de dezesseis câmeras
- **WHEN** o usuário seleciona o layout 16 e possui câmeras suficientes ativas
- **THEN** até dezesseis áreas são exibidas e a falha de uma delas não interrompe as demais

### Requirement: Seleção contextual de perfil
O sistema SHALL preferir substream em grids e main stream em visualização individual ou fullscreen quando esses perfis estiverem disponíveis, permitindo seleção manual.

#### Scenario: Entrada e saída de fullscreen
- **WHEN** o usuário alterna uma câmera do grid para fullscreen e depois retorna
- **THEN** o sistema pode trocar para o perfil principal e voltar ao substream sem perder o cadastro ou abrir sessões desnecessárias

### Requirement: Compartilhamento de pipeline
O sistema SHALL reutilizar um pipeline de mídia compatível quando a mesma câmera e perfil forem consumidos em mais de um local e SHALL encerrar pipelines sem consumidores após o período configurado.

#### Scenario: Mesmo stream em duas superfícies
- **WHEN** o dashboard e outra visualização solicitam simultaneamente a mesma câmera e perfil
- **THEN** ambos recebem o vídeo sem criar conexão ou conversão duplicada sem necessidade

### Requirement: Gestão de recursos de visualização
O sistema SHALL ajustar ou suspender streams invisíveis, em segundo plano ou minimizados segundo configuração, e SHALL liberar processos e buffers de streams não utilizados.

#### Scenario: Aplicativo minimizado
- **WHEN** o usuário minimiza o aplicativo com streams ativos
- **THEN** o sistema aplica a política configurada de economia sem interromper gravações em andamento

### Requirement: Estado compreensível por área
O sistema SHALL distinguir ao menos desconectada, conectando, conectada, reconectando, autenticação inválida, erro de rede, erro de mídia, codec incompatível e câmera indisponível.

#### Scenario: Codec incompatível
- **WHEN** nenhum caminho de reprodução ou fallback aceita o codec recebido
- **THEN** somente a área afetada mostra estado de codec incompatível e oferece diagnóstico sanitizado

