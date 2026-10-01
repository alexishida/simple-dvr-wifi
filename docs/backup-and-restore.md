# Backup e restauração

O backup exportado pela interface contém o catálogo SQLite e as configurações
do aplicativo. Ele não inclui vídeos, snapshots, previews ou credenciais.

Credenciais são removidas antes de o arquivo ser entregue. A remoção é seguida
de `VACUUM`, evitando que ciphertext de páginas livres permaneça no arquivo.
As credenciais precisam ser cadastradas novamente após a restauração, pois a
chave do cofre pertence ao computador atual.

Na restauração, o aplicativo valida a extensão, o tamanho, o cabeçalho SQLite,
a integridade do banco e as tabelas essenciais. A tela mostra a quantidade de
câmeras, gravações, snapshots e períodos agendados antes da confirmação.

A única estratégia disponível é substituir: ela troca configurações e catálogo
em vez de tentar mesclar registros potencialmente conflitantes. O aplicativo
recusa a operação com gravações ativas, preserva uma cópia consistente do banco
atual em `userData/backups/` e reinicia após concluir a troca. Os diretórios de
mídia configurados são preservados como referências de configuração; os arquivos
de mídia não são copiados, movidos nem excluídos.
