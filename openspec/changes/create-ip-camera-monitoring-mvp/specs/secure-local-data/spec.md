## Purpose

Manter configurações e segredos exclusivamente sob controle local, com persistência íntegra, criptografia autenticada e acesso mínimo entre os componentes do aplicativo.

## ADDED Requirements

### Requirement: Banco local autoritativo
O sistema SHALL persistir câmeras, capacidades, perfis, preferências, snapshots e gravações em armazenamento local versionado que continue disponível offline.

#### Scenario: Reinício da aplicação
- **WHEN** o usuário salva uma câmera e reinicia o aplicativo
- **THEN** o cadastro, suas configurações e referências de mídia são restaurados sem depender de serviço externo

### Requirement: Credenciais cifradas em repouso
O sistema MUST armazenar usuário, senha, tokens, chaves e outros segredos somente sob criptografia autenticada equivalente a AES-256-GCM, usando nonce único por operação.

#### Scenario: Inspeção do banco local
- **WHEN** alguém examina diretamente o banco sem acesso à chave protegida
- **THEN** não encontra credenciais em texto puro e adulterações do ciphertext são detectadas

### Requirement: Proteção da chave mestra
O sistema MUST proteger a chave mestra com mecanismo seguro do sistema operacional e MUST NOT usar chave fixa universal nem armazenar a chave em texto puro junto aos dados cifrados.

#### Scenario: Primeiro uso em sistema suportado
- **WHEN** o aplicativo precisa persistir a primeira credencial
- **THEN** cria ou recupera material criptográfico por uma proteção vinculada ao usuário ou sistema operacional antes de cifrar o segredo

### Requirement: Uso mínimo de segredos
O sistema MUST descriptografar somente a credencial necessária, no componente privilegiado responsável pela operação, pelo menor tempo prático e MUST NOT enviar o conjunto de credenciais ao renderer.

#### Scenario: Abertura da tela de câmeras
- **WHEN** a interface lista todos os dispositivos cadastrados
- **THEN** recebe apenas indicadores de existência de credencial e nenhum segredo descriptografado

### Requirement: Edição sem revelar senha salva
O sistema SHALL apresentar senha existente como ausente, mascarada ou apenas indicada e SHALL conservar a credencial atual quando o usuário não fornece substituição.

#### Scenario: Editar somente nome
- **WHEN** o usuário altera o nome da câmera e deixa o campo de nova senha vazio
- **THEN** o sistema atualiza o nome sem descriptografar ou substituir a credencial na interface

### Requirement: Atualização e exclusão de credenciais
O sistema MUST cifrar uma nova credencial antes da persistência e SHALL remover logicamente todos os segredos associados quando uma câmera é excluída.

#### Scenario: Substituição de senha
- **WHEN** uma nova senha válida é confirmada
- **THEN** a forma cifrada anterior é substituída sem criar log ou arquivo temporário com o valor aberto

### Requirement: Backups e exportações seguros
O sistema MUST preservar credenciais cifradas em backups e MUST NOT incluir senhas em texto puro em exportações de configuração.

#### Scenario: Backup do banco
- **WHEN** é produzida uma cópia de segurança do armazenamento local
- **THEN** os segredos permanecem cifrados e não é gerada cópia aberta intermediária

### Requirement: IPC de menor privilégio
O sistema MUST expor ao renderer somente operações IPC nomeadas e específicas, validar argumentos no lado privilegiado e MUST NOT expor execução de comandos, acesso arbitrário a arquivos, IPC bruto ou leitura global de segredos.

#### Scenario: Canal ou caminho manipulado
- **WHEN** o renderer tenta invocar canal não autorizado ou fornece caminho fora da raiz permitida
- **THEN** a operação é rejeitada antes de acessar o sistema operacional

### Requirement: Integridade e migrações
O sistema SHALL versionar o esquema, aplicar migrações transacionais e detectar falhas ou corrupção sem causar perda adicional de dados válidos.

#### Scenario: Migração falha
- **WHEN** uma atualização não consegue concluir a migração do banco
- **THEN** a transação é revertida, a versão anterior permanece recuperável e o usuário recebe orientação sem exposição de segredos

### Requirement: Importações não confiáveis
O sistema MUST validar formato, tamanho, URLs, identificadores, conteúdo e campos de credencial antes de aceitar qualquer dado importado.

#### Scenario: Configuração importada contém URL maliciosa
- **WHEN** um arquivo importado contém esquema proibido ou tamanho acima do limite
- **THEN** a importação é rejeitada sem executar conteúdo ou alterar dados persistidos

