## Purpose

Garantir que o MVP possa ser distribuído e validado de forma repetível, com dependências incluídas, licenças conhecidas e evidência funcional e de segurança.

## ADDED Requirements

### Requirement: Pacote Windows autossuficiente
O sistema SHALL produzir instalador apropriado para Windows com todas as dependências necessárias à execução normal incluídas ou instaladas de forma documentada.

#### Scenario: Instalação em máquina Windows limpa
- **WHEN** o instalador é executado em Windows 10 ou 11 suportado sem ambiente de desenvolvimento
- **THEN** o aplicativo inicia e encontra seus componentes de mídia sem configuração técnica manual

### Requirement: Prontidão para futura portabilidade
O sistema SHALL isolar caminhos, permissões, processos, armazenamento seguro e aceleração atrás de interfaces de plataforma para viabilizar suporte futuro a outros sistemas operacionais sem alterar os fluxos essenciais.

#### Scenario: Seleção de diretório no Windows
- **WHEN** o usuário escolhe um diretório válido de gravações no Windows
- **THEN** o caminho é validado pela camada de plataforma e usado pelo fluxo funcional

### Requirement: Licenciamento validado antes da distribuição
O sistema MUST registrar e revisar licenças, codecs, opções de compilação e obrigações de redistribuição de todo componente de mídia ou biblioteca nativa antes de publicar um pacote.

#### Scenario: Build inclui novo codec ou binário
- **WHEN** uma dependência de mídia é adicionada ou sua configuração de build muda
- **THEN** a distribuição é bloqueada até que compatibilidade de licença e avisos necessários sejam documentados

### Requirement: Testes funcionais automatizados
O sistema SHALL possuir testes para descoberta encontrada e vazia, credencial válida e inválida, câmera offline, RTSP disponível e indisponível, PTZ presente e ausente, perda de conexão e reconexão.

#### Scenario: Pipeline de integração do MVP
- **WHEN** a suíte automatizada roda contra os simuladores suportados
- **THEN** cada fluxo obrigatório produz resultado verificável e falhas impedem a promoção do build

### Requirement: Testes de segurança
O sistema SHALL verificar exposição de credenciais, sanitização de logs, IPC não autorizado, URLs e caminhos maliciosos, command injection, XML hostil, entradas inválidas e permissões.

#### Scenario: Argumento RTSP com metacaracteres de shell
- **WHEN** um teste fornece URL contendo caracteres capazes de alterar um comando shell
- **THEN** o componente trata a URL como argumento literal ou a rejeita e nenhum comando adicional é executado

### Requirement: Ambiente sem câmera física
O sistema SHALL fornecer ambiente de teste reproduzível com WS-Discovery/ONVIF simulado e streams de rede H.264, H.265 quando aplicável e MJPEG.

#### Scenario: Desenvolvimento offline de hardware
- **WHEN** a suíte é executada sem câmera física conectada
- **THEN** descoberta, autenticação, mídia, falha e reconexão podem ser exercitadas com fixtures controladas

### Requirement: Matriz com câmeras reais
O sistema SHALL registrar validação antes da versão estável com câmeras somente RTSP, ONVIF básica, PTZ, H.264, H.265 quando aplicável, firmware antigo e ONVIF incompleto de fabricantes diversos.

#### Scenario: Candidato a versão estável
- **WHEN** um build é proposto para produção
- **THEN** existe evidência por plataforma e categoria de câmera, incluindo limitações conhecidas sem promessa de compatibilidade universal

### Requirement: Critério de aceite do MVP
O sistema SHALL considerar o MVP aprovado somente quando instalação, cadastro ou descoberta, autenticação, persistência segura, reinício, vídeo, múltiplas câmeras, PTZ suportado, snapshot, gravação e reconexão forem demonstrados no Windows.

#### Scenario: Validação de ponta a ponta
- **WHEN** um usuário executa o roteiro de aceite em cada plataforma suportada
- **THEN** conclui o fluxo principal sem ferramentas de desenvolvimento e sem perda de configuração ou exposição de senha
