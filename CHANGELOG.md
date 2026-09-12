# Changelog

Todas as mudanças relevantes deste projeto são registradas aqui. O formato é
baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o
versionamento segue [Semantic Versioning](https://semver.org/lang/pt-BR/).

## [Não publicado]

### Adicionado

- Presets de RTSP para modelos e famílias de câmeras, com geração de URL por
  endereço, porta, canal e stream.
- Teste visual e de interação isolado para o formulário de cadastro de câmera.
- Identidade visual com logo, wordmark, favicon e ícones de janela e instalador.
- Geração automática dos recursos de instalação a partir de `docs/logo/`.
- Testes de interação e responsividade para a tela de configurações.

### Alterado

- Fluxo de cadastro manual agora preserva credenciais em campos separados e
  permite substituir o preset por uma URL RTSP manual.
- Reprodução ao vivo otimizada para reduzir consumo de recursos e recuperar os
  players após minimizar e restaurar a janela.
- Experiência de tela cheia, configurações e biblioteca de mídia refinada.

### Corrigido

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
