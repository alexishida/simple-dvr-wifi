## Purpose

Definir uma camada de interoperabilidade baseada em padrões que detecta capacidades reais e tolera diferenças de protocolo, fabricante e firmware sem comprometer a segurança.

## ADDED Requirements

### Requirement: Protocolos de câmera do MVP
O sistema SHALL acessar recursos de câmera por HTTP, HTTPS, RTSP, RTP, RTCP e ONVIF, delegando transporte e mídia a componentes apropriados quando necessário.

#### Scenario: Perfil ONVIF fornece RTSP autenticado
- **WHEN** uma câmera expõe por ONVIF um perfil com URI RTSP que exige autenticação
- **THEN** o sistema obtém o stream usando a credencial autorizada e trata RTP/RTCP pelo mecanismo de mídia

### Requirement: Prioridade de integração aberta
O sistema SHALL priorizar padrões interoperáveis, ONVIF, RTSP e HTTP(S) documentado antes de qualquer integração proprietária.

#### Scenario: Recurso disponível por ONVIF e API proprietária
- **WHEN** a mesma função é suportada de forma válida por ONVIF e por uma API proprietária
- **THEN** o sistema utiliza a opção ONVIF no fluxo genérico

### Requirement: Detecção real de capacidades
O sistema SHALL consultar identidade, serviços ONVIF, Media/Media2, perfis, URIs, snapshots, PTZ, Imaging e demais capacidades e SHALL disponibilizar somente funções confirmadas pelo dispositivo.

#### Scenario: Dispositivo declara ONVIF sem PTZ
- **WHEN** a consulta de capacidades não confirma um serviço ou configuração PTZ utilizável
- **THEN** o sistema não apresenta a câmera como compatível com PTZ

### Requirement: Perfis e codecs
O sistema SHALL identificar perfis de mídia, resolução, taxa de quadros, main stream, substream e codecs H.264, H.265/HEVC ou MJPEG sempre que os dados estiverem disponíveis.

#### Scenario: Perfis principal e secundário encontrados
- **WHEN** a câmera retorna múltiplos perfis válidos com qualidades distintas
- **THEN** o sistema armazena as características e permite seleção manual ou contextual entre os perfis

### Requirement: Implementações ONVIF imperfeitas
O sistema SHALL tratar campos ausentes, respostas incompletas, capacidades incorretas, firmware defeituoso e serviços parcialmente implementados como falhas isoladas e diagnosticáveis.

#### Scenario: Resposta parcial de Media
- **WHEN** uma câmera retorna identidade válida mas um perfil de mídia incompleto
- **THEN** o sistema preserva os dados válidos, marca apenas a capacidade afetada como indisponível e permite informar uma URL RTSP manual

### Requirement: Transporte HTTPS por dispositivo
O sistema MUST validar certificados HTTPS por padrão e MUST aceitar certificado inválido, expirado ou autoassinado somente após exceção explícita e limitada à câmera correspondente.

#### Scenario: Certificado autoassinado sem exceção
- **WHEN** uma câmera apresenta certificado autoassinado ainda não aprovado
- **THEN** a conexão é recusada com explicação clara e nenhuma validação HTTPS global é desativada

#### Scenario: Exceção explícita vinculada à câmera
- **WHEN** o usuário confirma conscientemente a exceção para um certificado identificado
- **THEN** somente aquela câmera pode usar a exceção registrada e alterações relevantes do certificado exigem nova decisão

### Requirement: Entradas e respostas de rede não confiáveis
O sistema MUST validar endereços, portas, URLs, parâmetros, limites de resposta e XML/SOAP, desabilitando entidades externas e protegendo contra XXE, expansão de entidades e consumo excessivo de recursos.

#### Scenario: Resposta XML maliciosa
- **WHEN** uma câmera retorna XML com entidade externa ou payload acima do limite permitido
- **THEN** o parser rejeita a resposta sem acessar recursos locais, executar código ou derrubar outras conexões

### Requirement: Endereçamento e autenticação flexíveis
O sistema SHALL suportar hostnames e IPv4, não bloquear evolução para IPv6, aplicar timeout à resolução de nomes e permitir credenciais distintas por serviço quando exigidas.

#### Scenario: Credencial RTSP diferente de ONVIF
- **WHEN** um equipamento valida ONVIF e RTSP com credenciais diferentes
- **THEN** o usuário pode armazenar e usar cada credencial apenas no serviço correspondente

