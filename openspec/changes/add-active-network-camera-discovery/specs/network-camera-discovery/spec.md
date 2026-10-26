# Spec Delta

## Purpose

Encontrar câmeras e serviços de vídeo na rede local mesmo quando não anunciam
ONVIF por multicast, mantendo a varredura limitada e cancelável.

## ADDED Requirements

### Requirement: Varredura de hosts ativos da rede local
O sistema SHALL permitir varrer a sub-rede IPv4 da interface de rede selecionada e SHALL iniciar a sondagem de serviços somente nos endereços que responderem como ativos.

#### Scenario: Interface escolhida
- **WHEN** a pessoa inicia a descoberta em uma interface disponível
- **THEN** o sistema limita a varredura à sub-rede IPv4 daquela interface

#### Scenario: Host sem resposta
- **WHEN** um endereço da sub-rede não responde dentro do limite de tempo
- **THEN** o sistema não tenta portas de câmera nesse endereço

### Requirement: Sondagem limitada de serviços de câmera
O sistema SHALL testar apenas uma lista predefinida e limitada de portas e protocolos comuns de câmera em cada host ativo, com limites de concorrência e tempo total.

#### Scenario: Serviço reconhecido
- **WHEN** uma porta de câmera conhecida responde em um host ativo
- **THEN** o sistema registra o host e os serviços ONVIF, RTSP ou HTTP/HTTPS reconhecidos sem expor credenciais

#### Scenario: Cancelamento da busca
- **WHEN** a pessoa cancela a descoberta em andamento
- **THEN** o sistema interrompe hosts e sondagens pendentes e não publica resultados posteriores

### Requirement: Identificação e resultado de descoberta
O sistema SHALL tentar identificar fabricante e modelo por serviços acessíveis e SHALL apresentar os hosts de câmera reconhecidos, incluindo os que ainda precisam de credenciais para concluir a identificação.

#### Scenario: Identidade acessível sem autenticação
- **WHEN** um serviço fornece fabricante ou modelo sem credenciais
- **THEN** o resultado da descoberta mostra os dados de identidade disponíveis

#### Scenario: Serviço exige autenticação
- **WHEN** um serviço de câmera reconhecido exige credenciais para expor identidade ou streaming
- **THEN** o resultado permite seguir para a etapa de credenciais sem afirmar que o stream foi validado

### Requirement: Serviços não reconhecidos
O sistema SHALL informar quando a busca não reconhecer um serviço de câmera em um host ativo e SHALL preservar a opção de configuração manual por URL.

#### Scenario: Protocolo proprietário não identificado
- **WHEN** um host ativo não expõe um serviço ONVIF, RTSP ou HTTP/HTTPS reconhecível
- **THEN** o sistema não o apresenta como câmera configurável automaticamente e orienta o uso de IP ou URL manual
