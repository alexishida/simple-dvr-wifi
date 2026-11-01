# Cadastro automatico de cameras

Selecione um dispositivo descoberto (ou informe seu IP) e forneca a conta local da camera. A confirmacao sugere o nome e mantem os campos tecnicos na configuracao avancada.

O cadastro agrupa os perfis ONVIF pela fonte de video, com reconhecimento do parametro de canal anunciado em URLs RTSP. Cada fonte gera um canal de monitoramento com principal e lite, quando ambos estiverem acessiveis. Tres lentes anunciadas geram tres canais vinculados pelo mesmo identificador de dispositivo. Variantes de qualidade da mesma fonte nao geram lentes adicionais.

Os canais aparecem separadamente no mosaico e podem ser gravados individualmente. Os enderecos descobertos ficam protegidos na confirmacao para evitar divergencia entre o IP e as URLs. Para corrigir o alvo, volte a etapa de acesso.

A configuracao testa cada principal e lite antes de confirmar. Um lite inacessivel e omitido, permitindo que o player use o principal como alternativa. Se algum principal falhar, a configuracao pede revisao. Se o salvamento de um canal falhar, os canais ja criados nessa tentativa sao removidos.

A compatibilidade com iCSee depende dos servicos locais e dos canais anunciados pelo firmware. O app nao presume que todo dispositivo tenha tres lentes e nao descobre canais exclusivos da nuvem do fabricante.

A confirmacao mostra uma imagem capturada de cada canal, usando o lite quando disponivel. Esta imagem e estatica; o video ao vivo continua disponivel no monitoramento apos o cadastro. As capturas usam arquivos temporarios removidos ao terminar, inclusive em caso de erro, e nao entram na biblioteca. Uma previa indisponivel nao impede o cadastro.
