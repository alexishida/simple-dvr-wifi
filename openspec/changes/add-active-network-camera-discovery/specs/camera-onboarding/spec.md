# Spec Delta

## MODIFIED Requirements

### Requirement: Configuração automática de câmera detectada
O sistema SHALL permitir selecionar uma câmera ou serviço de câmera reconhecido na descoberta de rede, receber suas credenciais e tentar identificar o dispositivo e configurar um stream sem exigir URL manual.

#### Scenario: Stream ONVIF disponível
- **WHEN** a câmera selecionada aceita as credenciais e anuncia uma URI de stream ONVIF utilizável
- **THEN** o sistema identifica fabricante e modelo, valida o stream e permite concluir o cadastro sem informar URL

#### Scenario: Endpoint de modelo confiável
- **WHEN** a câmera identificada não anuncia uma URI de stream utilizável mas possui um fallback confiável para seu modelo
- **THEN** o sistema valida esse fallback antes de oferecer a conclusão do cadastro

#### Scenario: Serviço descoberto sem identidade completa
- **WHEN** a descoberta reconhece um serviço de câmera mas não obtém identidade completa sem autenticação
- **THEN** o sistema solicita credenciais antes de abrir o formulário de cadastro
