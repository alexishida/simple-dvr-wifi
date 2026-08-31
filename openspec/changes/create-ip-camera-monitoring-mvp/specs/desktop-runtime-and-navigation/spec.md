## Purpose

Define a experiência desktop segura, navegável e independente de internet que hospeda todas as funções locais de monitoramento no Windows, sem impedir futura portabilidade.

## ADDED Requirements

### Requirement: Execução desktop no Windows
O sistema SHALL iniciar como aplicativo independente em Windows 10/11 de 64 bits, sem exigir Node.js ou ferramentas de desenvolvimento instaladas pelo usuário.

#### Scenario: Inicialização sem ambiente de desenvolvimento
- **WHEN** o usuário inicia uma instalação suportada no Windows sem Node.js instalado
- **THEN** a aplicação abre e disponibiliza suas funções locais

### Requirement: Operação local sem internet
O sistema SHALL permitir abrir o aplicativo, consultar câmeras locais, usar ONVIF, visualizar RTSP, controlar PTZ, capturar mídia e gravar localmente sem conexão com a internet.

#### Scenario: Rede local isolada
- **WHEN** o computador possui acesso à rede das câmeras mas não à internet
- **THEN** todas as funções do MVP que dependem apenas da rede local permanecem disponíveis

### Requirement: Janela Electron protegida
O sistema MUST executar o conteúdo visual com isolamento de contexto, sandbox, integração Node desativada, segurança web ativa e política de conteúdo restritiva, sem carregar conteúdo remoto não confiável na janela privilegiada.

#### Scenario: Conteúdo tenta acessar recurso privilegiado
- **WHEN** um script do renderer tenta acessar Node.js, IPC genérico ou navegar a uma origem externa dentro da janela
- **THEN** o acesso é bloqueado e nenhuma capacidade do sistema operacional é concedida

### Requirement: Navegação e superfícies do MVP
O sistema SHALL oferecer navegação clara entre dashboard, câmeras, descoberta, gravações, snapshots, diagnóstico e configurações, preservando o vídeo como foco principal do dashboard.

#### Scenario: Acesso às áreas principais
- **WHEN** o usuário seleciona uma seção na navegação
- **THEN** a área correspondente é exibida sem interromper streams não relacionados

### Requirement: Interface adaptada a monitoramento
O sistema SHALL oferecer tema escuro, hierarquia legível, estados visuais previsíveis e layout responsivo que continue utilizável nos tamanhos de janela suportados.

#### Scenario: Uso em janela reduzida
- **WHEN** o usuário reduz a janela abaixo do tamanho confortável do grid atual
- **THEN** a navegação e os controles essenciais permanecem acessíveis e a interface evita sobreposição de conteúdo

### Requirement: Configurações gerais
O sistema SHALL permitir configurar, no mínimo, tema, diretórios de snapshots e gravações, parâmetros de reconexão, comportamento de streams, aceleração de hardware e nível de logs quando aplicáveis.

#### Scenario: Alteração de configuração persistente
- **WHEN** o usuário salva uma configuração válida e reinicia o aplicativo
- **THEN** o valor é restaurado e aplicado sem expor acesso arbitrário ao sistema de arquivos
