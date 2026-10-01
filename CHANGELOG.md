# Changelog

Todas as mudanças relevantes deste projeto são registradas aqui. O formato é
baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o
versionamento segue [Semantic Versioning](https://semver.org/lang/pt-BR/).

## [Não publicado]

### Adicionado

- Backup e restauração de catálogo e configurações pela interface, com prévia,
  verificação de integridade, cópia do banco anterior e exclusão de credenciais
  vinculadas ao computador.
- Reprodução sincronizada de até quatro câmeras no mesmo instante, com lacunas
  explícitas e compensação manual de relógio por câmera.

- Consulta e importação de gravações do cartão SD da Intelbras Mibo iM4-C na
  biblioteca, com busca por dia, download autenticado e conversão para MP4. A tela
  Gravações separa a biblioteca local e o cartão SD em abas.

- Agenda semanal de gravação por câmera, com editor de períodos, suporte a
  meia-noite, prioridade do comando manual e indicação do próximo início.
- Reconciliação de gravações agendadas no início, retorno de suspensão e em
  execução, além de recuperação do catálogo após encerramento inesperado.

- Presets de RTSP para modelos e famílias de câmeras, com geração de URL por
  endereço, porta, canal e stream.
- Teste visual e de interação isolado para o formulário de cadastro de câmera.
- Identidade visual com logo, wordmark, favicon e ícones de janela e instalador.
- Geração automática dos recursos de instalação a partir de `docs/logo/`.
- Testes de interação e responsividade para a tela de configurações.
- Ícone na bandeja do sistema, com ações para restaurar ou encerrar o aplicativo.

### Alterado

- Consulta do próximo horário de gravação evita percorrer a semana quando não
  há períodos habilitados e compara intervalos numéricos por dia da semana.
- Leitura de previews limita a alocação antes de carregar o arquivo e fecha o
  descritor também em falhas de validação.

- A avaliação de detecção local concluiu que não há modelo e runtime aprovados
  para distribuição nesta versão; nenhuma inferência ou envio de imagens foi
  adicionado.

- Fluxo de cadastro manual agora preserva credenciais em campos separados e
  permite substituir o preset por uma URL RTSP manual.
- Reprodução ao vivo otimizada para reduzir consumo de recursos e recuperar os
  players após minimizar e restaurar a janela.
- Fechar a janela agora mantém o monitoramento em execução na bandeja do sistema.
- Experiência de tela cheia, configurações e biblioteca de mídia refinada.

### Corrigido

- Alterações na agenda durante uma reconciliação em andamento provocam uma nova
  consulta, sem executar reconciliações simultâneas.
- Falhas de atualização da agenda em segundo plano geram um alerta local e
  permitem novas tentativas, sem rejeições de Promise não tratadas.

- Validação de URLs RTSP e geração de endpoints para canais, streams e IPv6.
- Ciclo de vida dos players ao vivo, com tratamento de cancelamento e troca de
  perfil de stream.

### Segurança

- Regressões cobrem persistência cifrada de credenciais, contenção de caminhos,
  sanitização de diagnósticos e comunicação de mídia local.

## Histórico anterior

O repositório já continha entregas de monitoramento ao vivo, ONVIF/RTSP, PTZ,
snapshots, gravação, catálogo local e verificações de segurança antes da adoção
deste changelog. Consulte o histórico Git para o detalhamento por commit.
