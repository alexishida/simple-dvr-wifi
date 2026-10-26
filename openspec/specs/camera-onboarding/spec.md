# camera-onboarding Specification

## Purpose

Oferecer um cadastro inicial de câmeras simples, que configure streaming
automaticamente sempre que o equipamento e a rede permitirem.

## Requirements

### Requirement: Escolha do método de cadastro
O sistema SHALL apresentar três métodos na primeira tela de adicionar câmera: detecção automática na rede, configuração por IP e configuração manual por URL.

#### Scenario: Métodos disponíveis
- **WHEN** a pessoa inicia o cadastro de uma câmera
- **THEN** o sistema exibe as três opções de método antes dos campos técnicos de URL

#### Scenario: Configuração manual escolhida
- **WHEN** a pessoa escolhe adicionar manualmente por URL
- **THEN** o sistema apresenta os campos de URL RTSP e URL ONVIF para cadastro manual

### Requirement: Configuração automática de câmera detectada
O sistema SHALL permitir selecionar uma câmera descoberta na rede, receber suas credenciais e tentar identificar o dispositivo e configurar um stream sem exigir URL manual.

#### Scenario: Stream ONVIF disponível
- **WHEN** a câmera selecionada aceita as credenciais e anuncia uma URI de stream ONVIF utilizável
- **THEN** o sistema identifica fabricante e modelo, valida o stream e permite concluir o cadastro sem informar URL

#### Scenario: Endpoint de modelo confiável
- **WHEN** a câmera identificada não anuncia uma URI de stream utilizável mas possui um fallback confiável para seu modelo
- **THEN** o sistema valida esse fallback antes de oferecer a conclusão do cadastro

### Requirement: Configuração automática por IP
O sistema SHALL aceitar IP ou hostname, usuário e senha e tentar localizar um endpoint ONVIF no host informado para configurar o stream automaticamente.

#### Scenario: Configuração por IP bem-sucedida
- **WHEN** o endpoint ONVIF e um stream válido são encontrados no host informado
- **THEN** o sistema exibe a identidade detectada e permite concluir o cadastro sem URL manual

#### Scenario: Tentativa limitada ao host informado
- **WHEN** a pessoa inicia a configuração por IP
- **THEN** o sistema tenta somente endpoints e portas ONVIF predefinidos no IP ou hostname fornecido

### Requirement: Fallback para configuração manual
O sistema SHALL encaminhar para configuração manual quando a automação não encontrar um stream validado, preservando dados seguros já descobertos.

#### Scenario: Automação sem stream utilizável
- **WHEN** a descoberta automática ou por IP não encontra um stream validado
- **THEN** o sistema oferece a configuração manual e preserva o endereço, identidade e endpoint ONVIF descobertos quando disponíveis

#### Scenario: Cadastro sem URL manual
- **WHEN** a pessoa tenta concluir o fluxo automático sem um stream validado
- **THEN** o sistema não conclui o cadastro e orienta a informar uma URL manual ou corrigir as credenciais
