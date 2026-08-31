## Purpose

Fornecer captura e gravação local rastreáveis, eficientes e recuperáveis, com estados honestos e bibliotecas simples para localizar os arquivos gerados.

## ADDED Requirements

### Requirement: Captura de snapshot
O sistema SHALL capturar snapshot pelo endpoint da câmera quando disponível e SHALL extrair um frame do stream como fallback, armazenando o resultado localmente.

#### Scenario: Endpoint de snapshot indisponível
- **WHEN** a câmera não oferece snapshot utilizável mas possui stream ativo
- **THEN** o sistema captura um frame do stream e confirma o arquivo salvo

### Requirement: Identificação de snapshots
O sistema SHALL associar cada snapshot à câmera e a um timestamp consistente e SHALL permitir localizá-lo em uma biblioteca de imagens.

#### Scenario: Consulta posterior
- **WHEN** o usuário abre a área de snapshots após capturas de várias câmeras
- **THEN** cada imagem pode ser identificada por câmera, data e hora

### Requirement: Gravação manual com estados explícitos
O sistema SHALL permitir iniciar e parar gravação manual e SHALL distinguir não gravando, iniciando, gravando, encerrando e erro de gravação em cada câmera.

#### Scenario: Início e parada bem-sucedidos
- **WHEN** o usuário inicia e depois para a gravação de uma câmera conectada
- **THEN** o indicador percorre os estados correspondentes e um registro concluído é criado com início, término, localização e estado

### Requirement: Preservação do stream original
O sistema SHALL gravar sem recodificação quando o codec e o contêiner permitirem e SHALL transcodificar somente quando necessário para produzir resultado utilizável.

#### Scenario: Stream compatível com gravação direta
- **WHEN** o stream recebido pode ser armazenado de forma estável por cópia
- **THEN** o arquivo preserva a qualidade original sem carga de transcodificação

### Requirement: Arquivo recuperável diante de interrupção
O sistema SHALL usar estratégia de contêiner e segmentação que reduza a perda total em encerramento inesperado e SHALL preservar partes válidas após queda de câmera ou mídia.

#### Scenario: Câmera cai durante gravação
- **WHEN** a conexão é interrompida durante uma gravação ativa
- **THEN** o estado deixa de indicar gravação normal, o arquivo válido já produzido é preservado e a tentativa de retomada é registrada

### Requirement: Biblioteca de gravações
O sistema SHALL listar gravações locais por câmera, data, horário, duração, localização e estado do arquivo, sem exigir timeline avançada no MVP.

#### Scenario: Arquivo parcial listado
- **WHEN** uma sessão termina de forma incompleta mas possui conteúdo recuperável
- **THEN** a biblioteca mostra o item com estado parcial ou interrompido em vez de ocultá-lo como concluído

### Requirement: Falhas de armazenamento visíveis
O sistema SHALL detectar diretório indisponível, falta de permissão, mídia removida e espaço insuficiente e MUST NOT descartar silenciosamente uma captura ou gravação.

#### Scenario: Disco fica sem espaço
- **WHEN** o destino atinge espaço insuficiente durante uma gravação
- **THEN** a gravação entra em erro, o conteúdo já válido é finalizado quando possível e o usuário recebe diagnóstico claro

### Requirement: Encerramento com gravações ativas
O sistema SHALL tentar finalizar gravações ativas antes de sair e SHALL informar o usuário quando o encerramento imediato puder causar perda.

#### Scenario: Fechamento durante gravação
- **WHEN** o usuário fecha o aplicativo com uma gravação ativa
- **THEN** o sistema inicia finalização coordenada e só abandona o processo após sucesso, confirmação explícita ou timeout controlado

