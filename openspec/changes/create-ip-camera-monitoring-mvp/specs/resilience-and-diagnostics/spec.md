## Purpose

Manter o aplicativo responsivo e diagnosticável diante de câmeras, redes, codecs, armazenamento ou componentes auxiliares instáveis, sem vazar dados sensíveis.

## ADDED Requirements

### Requirement: Timeouts finitos por operação
O sistema SHALL aplicar timeouts tratáveis a HTTP(S), DNS, ONVIF, RTSP, descoberta, autenticação, snapshot, inicialização de vídeo e PTZ.

#### Scenario: Câmera não responde
- **WHEN** uma operação excede seu timeout configurado
- **THEN** ela termina com erro categorizado, libera recursos e não bloqueia a interface nem outras câmeras

### Requirement: Reconexão progressiva
O sistema SHALL detectar perda temporária de stream e tentar reconectar com atraso progressivo, limite máximo configurável e cancelamento quando a câmera for desativada ou removida.

#### Scenario: Rede retorna após quedas temporárias
- **WHEN** um stream cai e a câmera volta a responder durante a política de tentativas
- **THEN** o pipeline inválido é substituído, o vídeo é restabelecido automaticamente e o estado volta a conectado

### Requirement: Isolamento por câmera e processo auxiliar
O sistema SHALL isolar conexões, streams, gravações e erros de protocolo de modo que a falha de uma câmera ou processador de mídia não derrube a aplicação nem outros dispositivos.

#### Scenario: Processador de uma câmera encerra inesperadamente
- **WHEN** o processo de mídia de uma câmera falha
- **THEN** o sistema detecta a saída, libera recursos, atualiza apenas essa câmera e tenta reiniciar conforme política

### Requirement: Diagnóstico categorizado
O sistema SHALL diferenciar falha interna, câmera indisponível, rede, autenticação, protocolo, mídia, codec, banco e armazenamento e SHALL apresentar mensagens compreensíveis ao usuário.

#### Scenario: Autenticação inválida
- **WHEN** uma câmera rejeita credenciais
- **THEN** a interface informa problema de autenticação, oferece atualização da credencial e não apresenta apenas uma exceção técnica

### Requirement: Logs sanitizados e úteis
O sistema SHALL registrar início e queda de conexão, reconexões, falhas de mídia, operações de gravação e erros de banco em níveis configuráveis, e MUST redactar senhas, tokens, chaves, Authorization e credenciais em URLs.

#### Scenario: Erro contém URL com usuário e senha
- **WHEN** um componente gera erro incluindo uma URL autenticada
- **THEN** o log substitui usuário e senha por marcadores antes da persistência ou exibição

### Requirement: Notificações consolidadas
O sistema SHALL manter problemas persistentes visíveis no estado da câmera sem gerar notificações repetitivas para cada tentativa automática.

#### Scenario: Câmera permanece offline
- **WHEN** várias tentativas de reconexão falham pelo mesmo motivo
- **THEN** o estado continua atualizado e eventos equivalentes são agrupados em vez de inundar o usuário

### Requirement: Monitoramento do armazenamento
O sistema SHALL verificar disponibilidade, permissão e espaço dos diretórios de dados e mídia e SHALL reportar falhas antes ou durante operações afetadas.

#### Scenario: Diretório de gravação removido
- **WHEN** a mídia que contém o diretório configurado é removida
- **THEN** novas gravações são impedidas ou marcadas em erro com explicação clara, sem afetar visualização ao vivo

### Requirement: Encerramento coordenado
O sistema SHALL encerrar streams, gravações, conexões, operações de banco e processos auxiliares e SHALL evitar processos órfãos após saída normal.

#### Scenario: Saída normal com streams ativos
- **WHEN** o usuário encerra o aplicativo sem gravações pendentes
- **THEN** todos os pipelines e conexões são finalizados dentro do timeout e nenhum auxiliar permanece executando

### Requirement: Datas consistentes
O sistema SHALL armazenar timestamps em formato interno consistente e apresentar horário local de forma clara em gravações, snapshots, logs e eventos.

#### Scenario: Consulta após mudança de fuso
- **WHEN** um item armazenado é visualizado em fuso horário diferente
- **THEN** sua ordenação temporal permanece correta e a apresentação indica o horário convertido sem alterar o instante original

