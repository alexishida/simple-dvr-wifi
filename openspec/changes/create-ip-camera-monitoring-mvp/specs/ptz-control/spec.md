## Purpose

Permitir controle PTZ ONVIF seguro e orientado por capacidades, com resposta previsível e proteção contra movimento contínuo indesejado.

## ADDED Requirements

### Requirement: Controles condicionados à capacidade
O sistema SHALL exibir somente operações PTZ confirmadas para a câmera selecionada, incluindo direções, diagonais, zoom, parada, movimento relativo, movimento absoluto e presets conforme suporte real.

#### Scenario: Câmera sem PTZ
- **WHEN** a câmera selecionada não possui configuração PTZ utilizável
- **THEN** a interface não oferece comandos de movimento e informa que o recurso não está disponível

### Requirement: Movimento contínuo com parada explícita
O sistema SHALL enviar início de movimento contínuo enquanto o controle estiver ativo e uma parada explícita quando o controle for liberado.

#### Scenario: Usuário solta o controle
- **WHEN** o usuário solta um botão após iniciar movimento contínuo
- **THEN** o sistema envia imediatamente o comando de parada para a câmera

### Requirement: Parada de segurança PTZ
O sistema MUST tentar parar movimento contínuo quando a janela perde foco, o componente é fechado, a câmera sai da visualização, a conexão falha, o comando expira ou a aplicação inicia encerramento.

#### Scenario: Janela perde foco durante movimento
- **WHEN** a janela perde foco enquanto uma câmera está em movimento contínuo
- **THEN** o sistema envia parada, cancela o estado de movimento na interface e registra apenas dados não sensíveis

#### Scenario: Confirmação de parada não chega
- **WHEN** ocorre falha de rede durante o envio da parada
- **THEN** o sistema interrompe comandos subsequentes, sinaliza estado inseguro e repete a parada dentro de um limite finito quando a conexão permitir

### Requirement: Limites e validação de velocidade
O sistema SHALL permitir ajustar velocidades horizontal, vertical e de zoom apenas dentro dos limites informados pela câmera e MUST rejeitar valores inválidos antes do envio.

#### Scenario: Valor acima do limite
- **WHEN** a interface ou uma mensagem manipulada solicita velocidade acima do máximo da câmera
- **THEN** o comando é rejeitado e nenhum valor fora do intervalo é enviado

### Requirement: Presets PTZ
O sistema SHALL permitir listar, acessar, criar, substituir e remover presets quando cada operação correspondente for suportada.

#### Scenario: Acessar preset existente
- **WHEN** o usuário seleciona um preset retornado pela câmera
- **THEN** o sistema solicita o movimento para esse preset e apresenta sucesso ou erro específico

### Requirement: Falhas PTZ isoladas
O sistema SHALL aplicar timeout aos comandos PTZ e SHALL tratar falhas sem interromper vídeo, gravação ou outras câmeras.

#### Scenario: Timeout de comando PTZ
- **WHEN** a câmera não responde ao comando dentro do limite
- **THEN** o controle retorna a estado neutro, tenta parada de segurança quando aplicável e o stream permanece ativo

