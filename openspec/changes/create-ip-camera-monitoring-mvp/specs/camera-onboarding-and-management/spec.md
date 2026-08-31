## Purpose

Permitir localizar, cadastrar, testar e administrar câmeras mesmo em redes onde descoberta automática ou parte dos serviços do dispositivo não funciona.

## ADDED Requirements

### Requirement: Descoberta ONVIF controlável
O sistema SHALL descobrir dispositivos ONVIF por WS-Discovery nas interfaces de rede selecionadas, deduplicar resultados, aplicar timeout e permitir cancelamento pelo usuário.

#### Scenario: Descoberta bem-sucedida
- **WHEN** o usuário inicia uma busca em uma interface com dispositivos ONVIF alcançáveis
- **THEN** cada dispositivo é apresentado uma vez com seus endereços identificados e uma ação para iniciar o cadastro

#### Scenario: Descoberta cancelada
- **WHEN** o usuário cancela uma busca em andamento
- **THEN** o sistema encerra a operação, preserva os resultados já encontrados e libera os recursos de descoberta

#### Scenario: Multicast indisponível
- **WHEN** nenhum dispositivo é encontrado por bloqueio de multicast, firewall, VLAN, VPN ou isolamento Wi-Fi
- **THEN** o sistema explica limitações prováveis e mantém o cadastro manual disponível sem alterar silenciosamente o firewall

### Requirement: Cadastro manual flexível
O sistema SHALL aceitar cadastro por IP ou hostname e combinações válidas de portas, URL ONVIF, URL RTSP, URL HTTP(S) e credenciais, sem exigir todos os campos simultaneamente.

#### Scenario: Cadastro somente RTSP
- **WHEN** o usuário informa nome, URL RTSP válida e credenciais de uma câmera sem ONVIF
- **THEN** o sistema permite testar e salvar o dispositivo com apenas os recursos detectados

### Requirement: Detecção assistida durante cadastro
O sistema SHALL tentar completar serviços, perfis, streams, identidade e capacidades a partir dos dados básicos fornecidos, sem depender de uma única porta predefinida.

#### Scenario: Dados básicos suficientes
- **WHEN** o usuário informa endereço e credenciais de um equipamento alcançável
- **THEN** o sistema tenta identificar endpoints e capacidades e apresenta separadamente o que foi encontrado e o que falhou

### Requirement: Teste de conexão segmentado
O sistema SHALL apresentar resultados independentes para alcance, autenticação, ONVIF, mídia, RTSP, snapshot, PTZ e codec quando aplicáveis.

#### Scenario: ONVIF falha e RTSP funciona
- **WHEN** o teste não consegue consultar ONVIF mas valida o stream RTSP
- **THEN** o resultado informa a falha ONVIF e o sucesso RTSP sem declarar toda a câmera indisponível

### Requirement: Prevenção de duplicidade
O sistema SHALL sinalizar possíveis duplicidades por endereço, identificador ONVIF ou número de série e permitir que o usuário confirme um cadastro separado.

#### Scenario: Número de série já cadastrado
- **WHEN** uma nova câmera apresenta o mesmo número de série de um cadastro existente
- **THEN** o sistema alerta sobre a duplicidade antes de salvar e oferece manter ou cancelar o cadastro separado

### Requirement: Ciclo de vida da câmera
O sistema SHALL permitir adicionar, visualizar, editar, testar, ativar, desativar e remover câmeras, preservando o nome amigável definido pelo usuário.

#### Scenario: Remoção confirmada
- **WHEN** o usuário confirma a exclusão de uma câmera
- **THEN** o cadastro e suas credenciais associadas são removidos logicamente, os recursos ativos são encerrados e as demais câmeras não são afetadas

### Requirement: Recuperação após mudança de endereço ou credencial
O sistema SHALL permitir reencontrar um dispositivo por identidade conhecida quando possível e editar manualmente endereço ou credencial após falha externa.

#### Scenario: Senha alterada na câmera
- **WHEN** o sistema identifica falha de autenticação após uma alteração externa de senha
- **THEN** o usuário recebe estado específico, pode informar nova credencial e os serviços são retomados após validação

