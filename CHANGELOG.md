# Changelog

Todas as mudanças relevantes deste projeto são registradas aqui. O formato é
baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o
versionamento segue [Semantic Versioning](https://semver.org/lang/pt-BR/).

## [Não publicado]

### Adicionado

- Relatório da C200 física com firmware `1.3.17 Build 260112 Rel.54862n(4555)`:
  ONVIF e RTSP autenticados, dois perfis H.264/G.711 anunciados e ausência de
  Recording/Search/Replay mesmo após autenticação.
- Plano de validação da Tapo C200 como candidata a segundo adaptador de cartão
  SD, com revisões prioritárias e limites de uso simultâneo documentados.
- Investigação oficial da Tapo C200 confirma RTSP/ONVIF Profile S ao vivo, mas
  não um serviço interoperável de busca ou replay do cartão SD.
- Matriz de compatibilidade de áudio e regressão que confirma a gravação em
  fMP4 sem transcodificação e independente do mute do player.

- O teste de conexão identifica fabricante e modelo via ONVIF, valida a URL RTSP
  anunciada e a preenche no cadastro. Para modelos específicos sem URL ONVIF,
  testa um endpoint da referência local antes de sugeri-lo.
- O codec de áudio anunciado pelos perfis ONVIF é persistido e exibido nas
  métricas da câmera, com migração compatível para os bancos existentes.

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

- Perfis ONVIF sem configuração de áudio não são mais descartados, restaurando
  a detecção de vídeo e PTZ da Intelbras iM4-C. Nós opcionais de vídeo também
  são tratados sem interromper a leitura dos demais recursos.
- Teste de conexão na edição reutiliza a credencial salva de ONVIF/RTSP quando
  a senha fica vazia. Endereço ou usuário alterado exige informar a senha;
  o formulário explica como testar e salvar uma nova credencial.
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
