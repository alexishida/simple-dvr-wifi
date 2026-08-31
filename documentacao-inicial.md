# DOCUMENTAÇÃO DO SISTEMA DE MONITORAMENTO E CONTROLE DE CÂMERAS IP/WI-FI

## 1. VISÃO GERAL

O sistema será uma aplicação desktop multiplataforma desenvolvida com Electron, destinada à visualização, gerenciamento e controle de câmeras IP/Wi-Fi.

A aplicação deverá funcionar em Windows e Linux e permitir que o usuário descubra câmeras disponíveis na rede, cadastre dispositivos manualmente, visualize transmissões ao vivo, utilize recursos ONVIF, controle câmeras PTZ, capture imagens, realize gravações e monitore várias câmeras simultaneamente.

O sistema deverá priorizar:

- compatibilidade;
- segurança;
- estabilidade;
- baixa latência;
- desempenho;
- facilidade de uso;
- tolerância a falhas de rede;
- suporte a diferentes fabricantes;
- extensibilidade futura.

---

# 2. PLATAFORMAS SUPORTADAS

O sistema deverá funcionar, no mínimo, em:

## Windows

- Windows 10 64 bits;
- Windows 11 64 bits.

## Linux

Deverá possuir suporte prioritário para distribuições desktop modernas, incluindo:

- Ubuntu;
- Debian;
- Linux Mint;
- Fedora;
- distribuições derivadas compatíveis.

A aplicação deverá evitar dependências que funcionem exclusivamente em um único sistema operacional.

Sempre que existirem diferenças entre Windows e Linux, o sistema deverá tratá-las de maneira transparente para o usuário.

---

# 3. TECNOLOGIA PRINCIPAL

A aplicação deverá utilizar Electron como plataforma desktop.

A implementação deverá adotar tecnologias compatíveis com:

- Electron;
- Node.js;
- TypeScript;
- interfaces modernas baseadas em Chromium.

A aplicação deverá ser compilável e distribuível como programa desktop independente.

O usuário final não deverá precisar instalar manualmente Node.js, ferramentas de desenvolvimento ou componentes utilizados internamente pelo programa.

---

# 4. PROTOCOLOS SUPORTADOS

O sistema deverá aceitar e trabalhar com os seguintes protocolos:

- HTTP;
- HTTPS;
- RTSP;
- RTP;
- RTCP;
- ONVIF.

O suporte poderá ser realizado diretamente pela aplicação ou através de componentes de mídia internos utilizados pelo programa.

---

# 5. HTTP

O sistema deverá aceitar recursos de câmeras disponibilizados através de HTTP.

Isso poderá incluir:

- snapshots;
- MJPEG;
- APIs;
- streams;
- endpoints de configuração;
- autenticação;
- recursos fornecidos diretamente pelo fabricante.

A aplicação deverá permitir informar manualmente URLs HTTP quando necessário.

---

# 6. HTTPS

O sistema deverá oferecer as mesmas capacidades previstas para HTTP através de conexões HTTPS.

Sempre que possível, certificados válidos deverão ser verificados normalmente.

Certificados inválidos, expirados ou autoassinados não deverão ser aceitos silenciosamente.

Caso seja necessário permitir uma exceção para uma câmera específica, essa decisão deverá ser explícita e informada ao usuário.

O sistema nunca deverá desabilitar globalmente a validação HTTPS apenas para permitir acesso a uma única câmera.

---

# 7. RTSP

O sistema deverá aceitar streams RTSP.

Exemplo conceitual:

rtsp://usuario:senha@192.168.1.100:554/stream

A aplicação deverá ser capaz de utilizar:

- URLs cadastradas manualmente;
- URLs obtidas através de ONVIF;
- main stream;
- substream;
- diferentes perfis de mídia fornecidos pela câmera.

O sistema deverá suportar autenticação quando exigida pelo servidor RTSP.

---

# 8. RTP

RTP deverá ser suportado como protocolo responsável pelo transporte de mídia quando utilizado pelas transmissões das câmeras.

Não existe obrigação de implementar manualmente todo o protocolo RTP dentro da aplicação caso um mecanismo de mídia apropriado já realize esse processamento.

O sistema poderá delegar RTP para componentes especializados de mídia.

---

# 9. RTCP

RTCP deverá ser reconhecido e suportado quando fizer parte da comunicação RTP utilizada pelo stream.

Poderá ser utilizado para informações relacionadas à sessão, sincronização, estatísticas, qualidade e controle associado ao transporte RTP.

Assim como RTP, RTCP poderá ser tratado pelo mecanismo interno de mídia sem necessidade de implementação manual no código da interface.

---

# 10. ONVIF

ONVIF deverá ser tratado como protocolo principal de interoperabilidade entre a aplicação e câmeras compatíveis.

A aplicação deverá utilizar ONVIF sempre que disponível para descobrir capacidades e acessar funções padronizadas da câmera.

O suporte ONVIF deverá considerar que diferentes dispositivos implementam diferentes partes do padrão.

Nenhum recurso poderá ser considerado automaticamente disponível apenas porque a câmera informa compatibilidade com ONVIF.

---

# 11. DESCOBERTA AUTOMÁTICA DE CÂMERAS

O sistema deverá possuir uma função de descoberta automática de dispositivos ONVIF na rede local.

A descoberta deverá utilizar mecanismos compatíveis com WS-Discovery.

Durante a descoberta, a aplicação deverá:

- localizar dispositivos;
- evitar duplicações;
- identificar endereços encontrados;
- apresentar os dispositivos ao usuário;
- permitir iniciar o cadastro diretamente a partir de um resultado encontrado.

A descoberta deverá possuir timeout.

O usuário deverá poder cancelar uma descoberta em andamento.

---

# 12. LIMITAÇÕES DA DESCOBERTA AUTOMÁTICA

O sistema deverá informar que descoberta automática pode não funcionar quando existir:

- bloqueio de multicast;
- firewall;
- VLAN;
- sub-redes diferentes;
- regras de roteamento;
- isolamento Wi-Fi;
- políticas de segurança da rede.

A ausência de um dispositivo na descoberta não deverá impedir seu cadastro manual.

---

# 13. CADASTRO MANUAL

O usuário deverá poder cadastrar uma câmera manualmente.

O cadastro poderá solicitar informações como:

- nome da câmera;
- endereço IP ou hostname;
- porta;
- usuário;
- senha;
- URL ONVIF;
- URL RTSP;
- URL HTTP ou HTTPS;
- informações adicionais necessárias para conexão.

Nem todos os campos deverão ser obrigatórios simultaneamente.

Quando possível, o programa deverá tentar descobrir automaticamente os dados restantes.

---

# 14. DETECÇÃO AUTOMÁTICA

Quando o usuário informar dados básicos de uma câmera, o programa deverá tentar identificar automaticamente:

- serviços ONVIF;
- perfis de mídia;
- RTSP;
- snapshots;
- fabricante;
- modelo;
- firmware;
- capacidades;
- suporte a PTZ;
- perfis disponíveis;
- stream principal;
- substream.

O sistema não deverá depender exclusivamente de uma única porta predefinida.

---

# 15. TESTE DE CONEXÃO

Antes ou depois do cadastro, o usuário deverá poder testar uma câmera.

O teste deverá apresentar resultados separados para diferentes aspectos da conexão.

Sempre que aplicável, mostrar:

- câmera alcançável;
- autenticação válida;
- ONVIF disponível;
- serviço de mídia disponível;
- RTSP disponível;
- snapshot disponível;
- PTZ disponível;
- codec identificado;
- erros encontrados.

Uma falha em determinado serviço não deverá fazer o sistema afirmar que toda a câmera está indisponível quando outros recursos funcionarem.

---

# 16. INFORMAÇÕES DA CÂMERA

Quando disponíveis, o sistema deverá identificar e armazenar informações como:

- fabricante;
- modelo;
- firmware;
- número de série;
- endereço de rede;
- MAC address;
- serviços suportados;
- capacidades.

Essas informações devem ser utilizadas para melhorar diagnóstico e experiência do usuário.

---

# 17. SERVIÇOS ONVIF

O sistema deverá consultar os serviços ONVIF suportados por cada equipamento.

Poderão ser utilizados, quando disponíveis:

- Device Management;
- Media;
- Media2;
- PTZ;
- Imaging;
- Events;
- Snapshot;
- serviços adicionais compatíveis.

O sistema deverá adaptar a interface de acordo com os serviços efetivamente suportados.

---

# 18. PERFIS DE MÍDIA

O sistema deverá consultar os perfis de mídia oferecidos pela câmera.

Quando existirem vários perfis, o usuário poderá visualizar ou selecionar entre eles.

Os perfis podem representar, por exemplo:

- resolução principal;
- substream;
- qualidade reduzida;
- diferentes codecs;
- diferentes taxas de frames.

A seleção poderá ser manual ou automática dependendo do contexto de uso.

---

# 19. STREAM PRINCIPAL E SUBSTREAM

O sistema deverá dar suporte ao uso de main stream e substream.

Sempre que possível:

- visualização em tela cheia deverá priorizar maior qualidade;
- grids com muitas câmeras deverão poder utilizar substreams;
- visualizações reduzidas poderão utilizar streams de menor resolução.

Essa regra tem como objetivo reduzir:

- CPU;
- memória;
- uso de rede;
- processamento gráfico.

---

# 20. VISUALIZAÇÃO DE VÍDEO

O sistema deverá apresentar vídeo ao vivo dentro da aplicação.

A solução não poderá depender da reprodução direta de uma URL RTSP pelo elemento de vídeo do Chromium quando isso não for suportado pelo ambiente.

Deverá existir um mecanismo adequado para transformar, encaminhar, empacotar ou transmitir o conteúdo para um formato reproduzível pela interface.

---

# 21. BAIXA LATÊNCIA

A visualização ao vivo deverá priorizar baixa latência.

O sistema deverá evitar buffers excessivos sempre que possível.

O objetivo é tornar a aplicação adequada para:

- monitoramento;
- controle PTZ;
- acompanhamento em tempo real;
- operação de câmeras.

---

# 22. CODECS

O sistema deverá considerar pelo menos:

- H.264;
- H.265/HEVC;
- MJPEG.

Outros formatos poderão ser adicionados futuramente.

O programa deverá identificar o codec recebido sempre que tecnicamente possível.

---

# 23. H.264

H.264 deverá ser tratado como codec prioritário por sua ampla compatibilidade.

Sempre que o conteúdo puder ser reutilizado sem recodificação, o sistema deverá preferir remux ou encaminhamento direto.

---

# 24. H.265 / HEVC

O sistema deverá considerar que suporte a H.265 pode variar de acordo com:

- Chromium;
- Electron;
- sistema operacional;
- hardware;
- codecs instalados;
- forma de distribuição da aplicação.

O programa não deverá assumir suporte universal a H.265.

Quando necessário, o sistema poderá converter H.265 para um formato compatível.

Essa conversão deverá ser utilizada apenas quando necessária por causa do maior consumo de recursos.

---

# 25. MJPEG

Streams MJPEG deverão ser aceitos quando disponibilizados pelas câmeras.

Esse formato poderá ser utilizado diretamente quando tecnicamente apropriado.

O sistema deverá considerar o maior consumo de banda típico de MJPEG em comparação com codecs de vídeo modernos.

---

# 26. TRANSCODIFICAÇÃO

A aplicação deverá evitar transcoding desnecessário.

Prioridade:

1. transmissão ou reprodução sem conversão;
2. remux;
3. transcodificação somente quando necessária.

Isso é especialmente importante ao exibir muitas câmeras simultaneamente.

---

# 27. PROCESSAMENTO DE MÍDIA

A aplicação poderá utilizar mecanismos especializados de processamento de vídeo.

Exemplos incluem:

- FFmpeg;
- GStreamer;
- media gateways;
- WebRTC gateways;
- tecnologias equivalentes.

A escolha final deverá priorizar:

- Windows;
- Linux;
- baixa latência;
- estabilidade;
- suporte H.264;
- suporte H.265;
- múltiplos streams;
- desempenho;
- facilidade de distribuição;
- segurança.

---

# 28. COMPONENTES EXTERNOS

Quando um componente externo fizer parte da aplicação, ele deverá ser distribuído juntamente com o programa sempre que seu licenciamento e arquitetura permitirem.

O usuário final não deverá precisar realizar configurações técnicas complexas para iniciar o aplicativo.

---

# 29. GRID DE CÂMERAS

O sistema deverá oferecer visualização simultânea de várias câmeras.

Inicialmente deverão ser considerados layouts como:

- 1 câmera;
- 4 câmeras;
- 9 câmeras;
- 16 câmeras.

O programa deverá permitir expansão futura para quantidades maiores.

---

# 30. CADA ÁREA DE VÍDEO

Cada câmera exibida no painel poderá mostrar:

- nome;
- vídeo;
- estado da conexão;
- indicador de gravação;
- fullscreen;
- snapshot;
- atalhos de controle;
- PTZ quando disponível.

A interface deverá evitar poluição visual excessiva.

---

# 31. FULLSCREEN

O usuário deverá poder visualizar uma câmera individualmente em tela cheia.

Ao entrar em fullscreen, o programa poderá utilizar automaticamente um stream de maior qualidade quando disponível.

Ao sair, poderá retornar ao substream utilizado no grid.

---

# 32. STATUS DAS CÂMERAS

Cada câmera deverá possuir estado de conexão identificável.

Estados esperados incluem conceitos equivalentes a:

- desconectada;
- conectando;
- conectada;
- reconectando;
- erro de autenticação;
- erro de rede;
- erro de stream;
- codec incompatível;
- câmera indisponível.

A nomenclatura apresentada ao usuário deverá estar em linguagem compreensível.

---

# 33. RECONEXÃO AUTOMÁTICA

Se um stream for interrompido devido a problema temporário, o sistema deverá tentar reconectar automaticamente.

Deverá ser utilizado mecanismo progressivo para evitar tentativas excessivas.

Exemplo conceitual:

- primeira tentativa após aproximadamente 1 segundo;
- posteriormente 2 segundos;
- 4 segundos;
- 8 segundos;
- intervalos progressivamente maiores;
- limite máximo configurável.

Quando a conexão voltar, o stream deverá ser restabelecido automaticamente.

---

# 34. TIMEOUTS

Operações de rede não poderão permanecer indefinidamente aguardando resposta.

Deverão existir timeouts apropriados para:

- HTTP;
- HTTPS;
- ONVIF;
- RTSP;
- descoberta;
- autenticação;
- snapshot;
- inicialização do vídeo;
- comandos PTZ.

Um timeout deverá resultar em erro tratável e compreensível.

---

# 35. PTZ

Se a câmera informar suporte ONVIF PTZ, o sistema deverá disponibilizar controles de movimentação.

Deverão ser considerados:

- cima;
- baixo;
- esquerda;
- direita;
- diagonais;
- zoom positivo;
- zoom negativo;
- parada.

---

# 36. MOVIMENTAÇÃO CONTÍNUA

Quando suportado pela câmera, o sistema deverá permitir movimentação contínua.

O movimento deverá começar enquanto o comando estiver ativo e deverá existir comando explícito de parada.

O sistema deverá evitar situações em que uma câmera continue se movimentando por perda do evento de interface.

---

# 37. PARADA DE SEGURANÇA DO PTZ

Sempre que uma movimentação contínua for iniciada, deverão existir mecanismos para garantir envio do comando de parada.

Isso deverá ocorrer em situações como:

- usuário soltar o botão;
- janela perder foco;
- componente de controle ser fechado;
- câmera ser removida da visualização;
- conexão apresentar erro.

---

# 38. VELOCIDADE PTZ

Se suportado, o usuário poderá ajustar:

- velocidade horizontal;
- velocidade vertical;
- velocidade de zoom.

Os valores deverão respeitar os limites informados pela câmera.

---

# 39. MOVIMENTO RELATIVO E ABSOLUTO

Quando disponibilizados pelo dispositivo, poderão ser utilizados:

- RelativeMove;
- AbsoluteMove.

A interface somente deverá disponibilizar funções que a câmera realmente suporte.

---

# 40. PRESETS

Câmeras com suporte deverão permitir gerenciamento de posições predefinidas.

O usuário poderá:

- visualizar presets;
- ir para um preset;
- criar preset;
- substituir preset;
- remover preset.

Essas funções dependerão das capacidades informadas pelo dispositivo.

---

# 41. SNAPSHOTS

O usuário deverá poder capturar uma imagem da câmera.

Prioridades:

1. utilizar snapshot fornecido pela própria câmera;
2. quando indisponível, extrair um frame do stream.

O resultado deverá ser armazenado localmente.

---

# 42. ORGANIZAÇÃO DOS SNAPSHOTS

Snapshots deverão ser identificáveis por:

- câmera;
- data;
- hora.

O usuário deverá conseguir localizar posteriormente as imagens capturadas.

A implementação interna da organização não é definida por este documento, desde que esses critérios sejam atendidos.

---

# 43. GRAVAÇÃO

O sistema deverá permitir iniciar e parar gravação manualmente.

Cada gravação deverá registrar:

- câmera;
- início;
- término;
- estado;
- localização;
- informações necessárias para posterior reprodução.

---

# 44. GRAVAÇÃO SEM TRANSCODIFICAÇÃO

Quando tecnicamente possível, o stream original deverá ser gravado sem recodificação.

Isso reduz:

- CPU;
- consumo energético;
- perda de qualidade;
- processamento.

Transcodificação deverá ocorrer apenas quando necessária.

---

# 45. FORMATO DE GRAVAÇÃO

A aplicação poderá utilizar formatos adequados de contêiner de vídeo, como:

- MP4;
- MKV;
- formatos equivalentes tecnicamente adequados.

A escolha deverá priorizar estabilidade e recuperação de arquivos.

---

# 46. FALHAS DURANTE GRAVAÇÃO

Se uma câmera perder conexão durante uma gravação:

- o sistema deverá detectar a interrupção;
- registrar o ocorrido;
- tentar recuperar a conexão quando apropriado;
- evitar deixar o usuário com a falsa impressão de que a gravação continua normalmente.

O arquivo produzido deverá ser preservado sempre que tecnicamente possível.

---

# 47. GERENCIAMENTO DE CÂMERAS

O usuário deverá poder:

- adicionar;
- visualizar;
- editar;
- testar;
- ativar;
- desativar;
- remover câmeras.

A exclusão deverá pedir confirmação quando puder resultar em perda de configurações relacionadas.

---

# 48. NOMES DAS CÂMERAS

Cada câmera deverá possuir um nome amigável configurável pelo usuário.

Exemplos:

- Entrada principal;
- Garagem;
- Sala;
- Estoque;
- Portão.

O nome não precisa ser igual ao hostname ou nome fornecido pelo fabricante.

---

# 49. BANCO DE DADOS LOCAL

Os dados do sistema deverão ser armazenados em banco de dados local.

O banco deverá permitir funcionamento offline da aplicação em relação a serviços externos.

O sistema não deverá depender de servidor em nuvem para armazenar suas configurações principais.

---

# 50. CREDENCIAIS

As credenciais das câmeras deverão ser armazenadas no banco de dados local da aplicação.

Essas credenciais deverão permanecer criptografadas quando estiverem armazenadas.

Isso se aplica a:

- usuário;
- senha;
- tokens;
- chaves de acesso;
- outros segredos de autenticação.

---

# 51. CRIPTOGRAFIA DAS CREDENCIAIS

Nunca armazenar credenciais em texto puro.

A criptografia deverá utilizar algoritmo moderno e autenticado, como AES-256-GCM ou tecnologia de nível de segurança equivalente.

A solução deverá fornecer:

- confidencialidade;
- integridade;
- detecção de adulteração.

---

# 52. CHAVE DE CRIPTOGRAFIA

A chave utilizada para proteger as credenciais não deverá ficar armazenada em texto puro junto com os próprios dados criptografados.

Também não deverá existir uma chave fixa e universal embutida no código ou instalador.

A proteção da chave deverá considerar mecanismos seguros disponíveis no sistema operacional ou técnicas equivalentes adequadas para aplicações locais.

---

# 53. IV / NONCE

Cada operação de criptografia deverá utilizar IV, nonce ou mecanismo equivalente apropriado ao algoritmo escolhido.

Valores que precisem ser únicos não poderão ser reutilizados de forma insegura.

---

# 54. USO DA CREDENCIAL EM MEMÓRIA

A credencial deverá ser descriptografada apenas quando necessária.

Após recuperar uma credencial:

- utilizá-la somente para a operação necessária;
- evitar duplicações desnecessárias;
- evitar persistência temporária;
- reduzir ao mínimo possível o tempo em memória.

---

# 55. INTERFACE E SENHAS SALVAS

Ao editar uma câmera existente, a interface não deverá recuperar e apresentar ao usuário a senha original.

O campo poderá aparecer:

- vazio;
- mascarado;
- indicando que existe uma senha armazenada.

Se o usuário não modificar a senha, a credencial existente deverá permanecer inalterada.

---

# 56. ALTERAÇÃO DE SENHA

Quando o usuário informar uma nova senha:

- criptografar antes de salvar;
- substituir a credencial anterior;
- não registrar o valor em logs;
- não deixar cópia em arquivo temporário.

---

# 57. EXCLUSÃO DE CREDENCIAIS

Quando uma câmera for excluída, suas credenciais associadas também deverão ser removidas do armazenamento lógico da aplicação.

O sistema deverá considerar limitações inerentes a bancos de dados, arquivos e mídias de armazenamento em relação à eliminação física imediata de bytes.

---

# 58. PROIBIÇÕES CRIPTOGRÁFICAS

Não deverão ser considerados mecanismos seguros de proteção de senha:

- Base64;
- XOR;
- cifra caseira;
- ofuscação;
- simples transformação textual;
- senha fixa incluída no aplicativo.

Hash isolado também não deverá substituir criptografia quando o sistema necessitar recuperar a senha original para autenticação da câmera.

---

# 59. BACKUPS

Caso exista backup do banco de dados, as credenciais deverão continuar criptografadas no backup.

Um backup nunca deverá gerar uma versão em texto puro das credenciais.

---

# 60. LOGS

O sistema deverá possuir registros de eventos e erros suficientes para diagnóstico.

Poderão existir níveis como:

- debug;
- informação;
- aviso;
- erro.

---

# 61. DADOS PROIBIDOS NOS LOGS

Nunca registrar:

- senha;
- token;
- chave;
- segredo;
- cabeçalho Authorization completo;
- credencial ONVIF;
- URL contendo senha visível.

---

# 62. SANITIZAÇÃO DE URL

URLs que contenham credenciais deverão ser sanitizadas antes de aparecer em logs.

Exemplo original:

rtsp://admin:123456@192.168.1.50:554/live

Exemplo seguro:

rtsp://***:***@192.168.1.50:554/live

---

# 63. MENSAGENS DE ERRO

As mensagens apresentadas ao usuário deverão ser claras.

Exemplo:

"Não foi possível autenticar na câmera."

é preferível a apresentar somente uma exceção técnica.

Detalhes técnicos poderão ser registrados separadamente, desde que não revelem informações sensíveis.

---

# 64. SEGURANÇA DO ELECTRON

A aplicação deverá seguir práticas de segurança recomendadas para Electron.

O conteúdo visual não deverá possuir acesso irrestrito ao sistema operacional ou APIs de Node.js.

Deverá existir isolamento entre:

- interface;
- funcionalidades privilegiadas;
- sistema operacional;
- processamento de rede.

---

# 65. ACESSO PRIVILEGIADO

A interface deverá receber somente as operações necessárias.

Não deverá ser fornecido mecanismo genérico que permita à interface:

- executar comandos;
- acessar arquivos arbitrários;
- iniciar programas arbitrários;
- executar código do sistema operacional;
- obter todas as credenciais armazenadas.

---

# 66. IPC

A comunicação interna entre componentes privilegiados e interface deverá utilizar operações explicitamente autorizadas.

As entradas deverão ser validadas.

Nenhuma mensagem enviada pela interface deverá ser considerada confiável sem validação.

---

# 67. COMMAND INJECTION

Dados recebidos do usuário, câmera ou rede nunca deverão ser concatenados diretamente em comandos shell.

Ao iniciar ferramentas de mídia ou componentes externos, os parâmetros deverão ser tratados de forma segura.

URLs RTSP são dados potencialmente não confiáveis.

---

# 68. CONTENT SECURITY POLICY

A interface deverá possuir política de segurança de conteúdo apropriada.

Deverão ser evitados:

- scripts arbitrários;
- execução de código remoto;
- eval desnecessário;
- conteúdo externo não confiável.

---

# 69. CONTEÚDO REMOTO

A aplicação não deverá carregar páginas arbitrárias da internet dentro de uma janela Electron com privilégios elevados.

Conteúdo remoto deverá ser tratado como não confiável.

---

# 70. VALIDAÇÃO DE ENTRADAS

Todas as entradas deverão ser validadas.

Isso inclui:

- IP;
- hostname;
- URL;
- porta;
- caminho;
- usuário;
- parâmetros PTZ;
- identificadores;
- dados retornados pelas câmeras.

O fato de um dado vir de uma câmera da rede local não significa que ele seja confiável.

---

# 71. SEGURANÇA DE XML

Como ONVIF utiliza SOAP/XML, o sistema deverá utilizar processamento XML seguro.

Deverá evitar vulnerabilidades como:

- XXE;
- expansão indevida de entidades;
- payloads XML maliciosos;
- consumo excessivo de recursos.

---

# 72. CÂMERAS NÃO CONFIÁVEIS

Todo dispositivo de rede deverá ser tratado como potencialmente não confiável.

Uma câmera comprometida não deverá conseguir executar código ou acessar dados arbitrários no computador através da aplicação.

---

# 73. COMPATIBILIDADE ONVIF

A aplicação não poderá assumir que todas as câmeras ONVIF seguem perfeitamente a especificação.

Deverá tolerar:

- campos ausentes;
- respostas incompletas;
- diferenças de implementação;
- capacidades declaradas incorretamente;
- firmware defeituoso.

---

# 74. CAPABILITY DETECTION

Toda função opcional deverá depender de detecção real de capacidade.

Exemplos:

PTZ somente se houver suporte PTZ.

Snapshots ONVIF somente quando houver suporte.

Imaging somente se o serviço estiver disponível.

Eventos somente se suportados.

---

# 75. FABRICANTES

O sistema deverá buscar compatibilidade genérica com equipamentos de diferentes marcas, incluindo, quando compatíveis com os padrões utilizados:

- Hikvision;
- Dahua;
- Intelbras;
- Reolink;
- Axis;
- Amcrest;
- Uniview;
- Vivotek;
- TP-Link/Tapo;
- dispositivos ONVIF genéricos.

Essa lista não representa garantia automática de compatibilidade com todos os modelos.

---

# 76. APIS PROPRIETÁRIAS

A solução deverá priorizar padrões abertos, especialmente ONVIF e RTSP.

Integrações proprietárias poderão ser adicionadas futuramente para ampliar funcionalidades.

O sistema principal não deverá depender exclusivamente da API de um fabricante.

---

# 77. FUNCIONALIDADES DE IMAGEM

Quando ONVIF Imaging estiver disponível, a aplicação poderá permitir configurações como:

- brilho;
- contraste;
- saturação;
- nitidez;
- exposição;
- balanço de branco.

Somente opções efetivamente suportadas pelo dispositivo deverão aparecer como disponíveis.

---

# 78. EVENTOS ONVIF

A arquitetura funcional deverá permitir futura implementação de eventos ONVIF.

Possíveis eventos incluem:

- movimento;
- entrada digital;
- alterações de estado;
- eventos analíticos.

Esse recurso poderá ser implementado em versões posteriores.

---

# 79. DESEMPENHO

O sistema deverá ser desenvolvido considerando visualização simultânea de múltiplas câmeras.

O processamento deverá evitar desperdício de recursos.

---

# 80. STREAMS DUPLICADOS

Quando a mesma câmera for exibida em mais de um local da interface, o sistema deverá evitar iniciar conexões ou conversões duplicadas sem necessidade.

Sempre que possível, um mesmo pipeline de mídia deverá poder atender múltiplos consumidores internos.

---

# 81. CPU

A aplicação deverá minimizar uso excessivo de CPU.

Prioridades:

- evitar transcodificação desnecessária;
- utilizar substream no grid;
- parar streams não utilizados quando apropriado;
- evitar cópias desnecessárias de frames.

---

# 82. MEMÓRIA

A aplicação deverá evitar manter buffers de vídeo excessivamente grandes.

Streams não utilizados deverão liberar recursos.

Falhas contínuas não deverão causar vazamento progressivo de memória.

---

# 83. REDE

A aplicação deverá considerar banda disponível.

Exibir dezesseis câmeras utilizando main stream poderá consumir grande largura de banda.

O sistema deverá favorecer automaticamente streams mais leves quando adequado.

---

# 84. GPU

Quando houver suporte seguro e estável, a aplicação poderá aproveitar aceleração de hardware.

Entretanto, a funcionalidade essencial não deverá depender exclusivamente de um determinado fabricante de GPU.

---

# 85. RECURSOS AO MINIMIZAR

O comportamento dos streams quando a aplicação estiver:

- minimizada;
- em segundo plano;
- com determinada câmera invisível;

deverá buscar equilíbrio entre disponibilidade imediata e redução de consumo de recursos.

Esse comportamento poderá ser configurável.

---

# 86. CONFIGURAÇÕES

O sistema deverá possuir área de configurações gerais.

Poderão existir opções relacionadas a:

- idioma;
- tema;
- diretório de gravações;
- diretório de snapshots;
- limites de armazenamento;
- reconexão;
- comportamento de streams;
- hardware acceleration;
- logs;
- notificações.

---

# 87. INTERFACE

A interface deverá possuir aparência moderna e adequada a sistemas de videomonitoramento.

Tema escuro deverá ser suportado e poderá ser o padrão.

A navegação deverá ser simples mesmo com grande quantidade de câmeras.

---

# 88. DASHBOARD

A tela principal deverá priorizar a visualização das câmeras.

Deverá permitir:

- selecionar layout;
- abrir câmera;
- verificar status;
- iniciar ações principais.

---

# 89. TELA DE CÂMERAS

Deverá existir uma área para gerenciamento dos dispositivos cadastrados.

Cada câmera deverá apresentar informações suficientes para identificação.

Exemplos:

- nome;
- IP;
- fabricante;
- modelo;
- status;
- recursos disponíveis.

---

# 90. TELA DE DESCOBERTA

Deverá existir uma área dedicada à busca automática de câmeras.

O usuário deverá poder:

- iniciar busca;
- interromper busca;
- atualizar resultados;
- selecionar dispositivo;
- cadastrar dispositivo descoberto.

---

# 91. TELA DE GRAVAÇÕES

O usuário deverá conseguir visualizar gravações locais.

Deverá ser possível identificar:

- câmera;
- data;
- horário;
- duração;
- estado do arquivo.

Funcionalidades avançadas de timeline poderão ser adicionadas posteriormente.

---

# 92. TELA DE SNAPSHOTS

O sistema deverá permitir visualizar imagens capturadas.

Deverão existir formas de identificar a câmera e o momento da captura.

---

# 93. DIAGNÓSTICO

O sistema deverá permitir acesso controlado a informações úteis para diagnóstico.

Exemplos:

- câmera offline;
- falha ONVIF;
- autenticação incorreta;
- timeout;
- stream encerrado;
- codec incompatível.

Nenhum diagnóstico poderá expor credenciais.

---

# 94. ESTADO OFFLINE

Uma câmera offline não deverá travar a interface.

O restante do sistema deverá continuar funcionando normalmente.

---

# 95. FALHA DE UMA CÂMERA

A falha de uma câmera não deverá interromper os streams de outras câmeras.

Cada conexão deverá possuir isolamento adequado para que erros sejam tratados individualmente.

---

# 96. FALHA DO PROCESSADOR DE MÍDIA

Se o componente responsável por um stream falhar, o programa deverá detectar a interrupção.

Quando apropriado deverá:

- liberar recursos;
- registrar o erro;
- reiniciar o processamento;
- informar o usuário quando necessário.

---

# 97. ENCERRAMENTO DA APLICAÇÃO

Ao fechar o programa, ele deverá encerrar corretamente:

- streams;
- gravações;
- conexões;
- processos auxiliares;
- operações de banco.

Não deverão permanecer processos órfãos executando após o encerramento normal.

---

# 98. GRAVAÇÃO DURANTE ENCERRAMENTO

Caso existam gravações em andamento, o programa deverá tentar finalizá-las corretamente antes de encerrar.

O usuário poderá ser avisado quando necessário.

---

# 99. ARMAZENAMENTO

O sistema deverá monitorar falhas relacionadas ao armazenamento local.

Exemplos:

- disco cheio;
- diretório indisponível;
- falta de permissão;
- mídia removida.

Essas situações deverão ser informadas de maneira clara.

---

# 100. ESPAÇO EM DISCO

O programa deverá permitir futuramente políticas de armazenamento como:

- limite máximo;
- retenção por dias;
- exclusão automática de gravações antigas;
- alertas de espaço insuficiente.

Nenhuma gravação deverá ser silenciosamente descartada sem que o sistema tenha uma política definida.

---

# 101. DUPLICIDADE DE CÂMERAS

Ao cadastrar uma nova câmera, o sistema deverá detectar possíveis duplicações quando existirem informações suficientes.

Exemplos:

- mesmo endereço;
- mesmo identificador ONVIF;
- mesmo número de série.

O usuário poderá decidir manter cadastros separados quando houver motivo legítimo.

---

# 102. ALTERAÇÃO DE IP

O sistema deverá tolerar mudança de IP quando houver algum mecanismo disponível para reencontrar o dispositivo.

Quando isso não for possível, deverá permitir edição manual.

---

# 103. HOSTNAMES

Além de endereços IPv4 ou IPv6 quando suportado, o sistema poderá aceitar hostnames.

Resoluções DNS deverão possuir timeout e tratamento de erro.

---

# 104. IPV6

A arquitetura funcional deverá evitar impedir suporte futuro ou atual a IPv6.

Recursos que funcionarem somente em IPv4 deverão ser identificados.

---

# 105. AUTENTICAÇÃO

O sistema deverá suportar mecanismos de autenticação normalmente necessários para câmeras e protocolos utilizados.

Nenhum método inseguro deverá ser preferido quando uma alternativa segura estiver disponível e suportada pelo dispositivo.

---

# 106. CREDENCIAIS DIFERENTES POR SERVIÇO

Quando necessário, o sistema deverá permitir que um equipamento utilize credenciais ou configurações distintas para serviços diferentes.

Por padrão, poderá reaproveitar as mesmas credenciais quando o equipamento assim funcionar.

---

# 107. TROCA DE CREDENCIAL

Quando a senha de uma câmera mudar externamente, o sistema deverá:

- detectar falha de autenticação;
- informar o usuário;
- permitir atualizar a credencial;
- retomar os serviços após a alteração.

---

# 108. PRIVACIDADE

O sistema deverá funcionar localmente por padrão.

Streams, snapshots, gravações e credenciais não deverão ser enviados automaticamente para serviços externos.

Qualquer funcionalidade futura de acesso remoto ou nuvem deverá ser explicitamente habilitada.

---

# 109. TELEMETRIA

Caso telemetria seja adicionada futuramente, ela deverá:

- ser claramente informada;
- respeitar opções de privacidade;
- nunca coletar credenciais;
- nunca enviar streams ou imagens sem autorização explícita.

---

# 110. ATUALIZAÇÕES

Caso o sistema possua atualização automática no futuro, pacotes deverão ser validados antes da instalação.

Atualizações não deverão permitir execução de binários não autenticados.

---

# 111. INSTALAÇÃO

A aplicação deverá ser distribuível para Windows e Linux de maneira simples.

No Windows deverá ser possível disponibilizar instalador apropriado.

No Linux poderão ser utilizados formatos compatíveis como:

- AppImage;
- pacote DEB;
- outros formatos adequados.

---

# 112. DEPENDÊNCIAS

Dependências necessárias à execução normal deverão ser distribuídas ou documentadas de forma adequada.

O usuário não deverá precisar configurar ambiente de desenvolvimento para executar a aplicação.

---

# 113. LICENCIAMENTO DE COMPONENTES

Qualquer biblioteca, codec, componente de vídeo ou ferramenta externa incorporada deverá ter seu licenciamento avaliado antes da distribuição comercial ou pública.

Isso é especialmente importante para:

- FFmpeg;
- codecs;
- bibliotecas nativas;
- componentes de terceiros.

---

# 114. TESTES FUNCIONAIS

O sistema deverá possuir testes para suas principais regras.

Deverão ser considerados cenários como:

- câmera encontrada;
- câmera não encontrada;
- credencial correta;
- credencial incorreta;
- câmera offline;
- RTSP funcionando;
- RTSP indisponível;
- PTZ disponível;
- PTZ indisponível;
- perda de conexão;
- reconexão.

---

# 115. TESTES DE SEGURANÇA

Deverão existir verificações relacionadas a:

- exposição de credenciais;
- logs;
- URLs maliciosas;
- command injection;
- IPC;
- XML;
- entradas inválidas;
- arquivos;
- permissões.

---

# 116. TESTES COM CÂMERAS REAIS

Antes de considerar uma versão pronta para produção, o sistema deverá ser testado com diferentes modelos e fabricantes.

Idealmente incluir:

- câmeras somente RTSP;
- câmeras ONVIF básicas;
- câmeras PTZ;
- H.264;
- H.265;
- câmeras com firmware antigo;
- câmeras com implementação ONVIF incompleta.

---

# 117. AMBIENTE DE TESTE SEM CÂMERA

O projeto deverá permitir a utilização de streams simulados durante desenvolvimento e testes.

Poderão ser utilizados arquivos de vídeo transformados em streams de rede ou servidores RTSP de teste.

Isso reduz dependência de hardware físico durante desenvolvimento.

---

# 118. FUNCIONALIDADES FUTURAS

A solução deverá permanecer preparada para expansão futura.

Possíveis recursos:

- detecção de movimento;
- eventos ONVIF;
- gravação automática;
- gravação por movimento;
- timeline;
- reprodução avançada;
- NVR;
- NAS;
- armazenamento remoto;
- múltiplos monitores;
- mapa de câmeras;
- notificações;
- usuários;
- permissões;
- acesso remoto;
- WebRTC;
- inteligência artificial;
- reconhecimento de objetos;
- detecção de pessoas;
- detecção de veículos;
- integração com alarmes.

Esses recursos não fazem parte obrigatória da primeira versão.

---

# 119. INTELIGÊNCIA ARTIFICIAL

Caso IA seja incorporada futuramente, deverá operar de maneira independente do fluxo fundamental de visualização.

Uma falha no módulo de IA não deverá interromper o stream normal da câmera.

---

# 120. MVP — PRIMEIRA VERSÃO FUNCIONAL

A primeira versão utilizável deverá permitir, no mínimo:

1. abrir a aplicação em Windows e Linux;

2. descobrir câmeras ONVIF na rede local;

3. cadastrar uma câmera manualmente;

4. informar credenciais;

5. armazenar as credenciais localmente de forma criptografada;

6. testar conexão;

7. consultar informações ONVIF;

8. identificar perfis de mídia;

9. obter stream RTSP;

10. visualizar vídeo ao vivo;

11. usar main stream ou substream quando disponíveis;

12. visualizar múltiplas câmeras;

13. detectar queda de conexão;

14. reconectar automaticamente;

15. controlar PTZ quando suportado;

16. capturar snapshot;

17. iniciar gravação;

18. parar gravação;

19. consultar status da câmera;

20. remover a câmera e suas credenciais associadas.

---

# 121. FLUXO PRINCIPAL DO USUÁRIO

Fluxo esperado:

Abrir aplicação

→ acessar descoberta de dispositivos

→ procurar câmeras

→ selecionar uma câmera encontrada

→ informar usuário e senha

→ testar conexão

→ identificar recursos

→ selecionar ou aceitar perfil de vídeo sugerido

→ cadastrar câmera

→ retornar ao painel

→ iniciar transmissão

→ visualizar vídeo ao vivo

→ utilizar PTZ, se disponível

→ realizar snapshot ou gravação quando desejado.

---

# 122. FLUXO DE CADASTRO MANUAL

Quando descoberta automática não funcionar:

Abrir cadastro manual

→ informar endereço da câmera

→ informar credenciais

→ informar portas ou URLs caso necessário

→ testar conexão

→ tentar detectar ONVIF

→ tentar detectar perfis

→ identificar RTSP

→ apresentar recursos encontrados

→ salvar câmera.

---

# 123. FLUXO DE RECUPERAÇÃO DE STREAM

Quando um stream for perdido:

detectar interrupção

→ alterar status da câmera

→ liberar recursos inválidos

→ aguardar intervalo apropriado

→ tentar reconectar

→ restabelecer mídia

→ atualizar status

→ continuar exibição.

---

# 124. FLUXO DE PTZ

Usuário seleciona câmera

→ sistema verifica capacidade PTZ

→ apresenta controles permitidos

→ usuário inicia movimento

→ sistema envia comando

→ usuário encerra movimento

→ sistema envia parada.

Em qualquer situação anormal relevante, o sistema deverá tentar impedir movimentação contínua indesejada.

---

# 125. FLUXO DE CREDENCIAIS

Usuário informa credenciais

→ aplicação valida entrada

→ utiliza credencial para conexão

→ criptografa antes da persistência

→ armazena somente a forma protegida

→ recupera somente quando necessário

→ descriptografa apenas para uso interno

→ nunca apresenta senha original novamente na interface.

---

# 126. REQUISITOS NÃO FUNCIONAIS

O sistema deverá buscar:

- inicialização rápida;
- interface responsiva;
- ausência de travamentos por falha de câmera;
- consumo de recursos proporcional à quantidade de streams;
- tratamento previsível de erros;
- segurança local;
- compatibilidade multiplataforma;
- manutenção simplificada;
- possibilidade de evolução.

---

# 127. DISPONIBILIDADE

A aplicação não precisa garantir disponibilidade ininterrupta de equipamentos externos.

Entretanto, deverá diferenciar claramente:

- falha interna da aplicação;
- indisponibilidade da câmera;
- erro de rede;
- problema de autenticação;
- problema de mídia.

---

# 128. OBSERVABILIDADE

Deverá ser possível diagnosticar problemas sem depender de informações sensíveis.

Logs e estados internos deverão ajudar a identificar:

- quando uma conexão iniciou;
- quando caiu;
- motivo provável;
- tentativa de reconexão;
- falhas do processador de mídia;
- operações de gravação;
- erros do banco.

---

# 129. RESILIÊNCIA

Erros individuais não deverão derrubar a aplicação inteira.

O sistema deverá isolar, na medida do possível:

- câmeras;
- streams;
- gravações;
- processos auxiliares;
- erros de protocolo.

---

# 130. COMPATIBILIDADE NÃO GARANTIDA

O programa deverá comunicar adequadamente que não é possível garantir 100% de compatibilidade com toda câmera IP existente.

Motivos incluem:

- implementações proprietárias;
- firmware;
- ONVIF incompleto;
- codecs específicos;
- protocolos modificados;
- recursos bloqueados pelo fabricante.

---

# 131. PRIORIDADE DE INTEROPERABILIDADE

Quando houver várias opções de integração, a prioridade deverá ser:

1. padrões interoperáveis;
2. ONVIF;
3. RTSP e protocolos de mídia padronizados;
4. HTTP/HTTPS documentados;
5. integrações proprietárias quando realmente necessárias.

---

# 132. PRINCÍPIO DE MENOR PRIVILÉGIO

Cada parte do programa deverá possuir apenas o acesso necessário para cumprir sua função.

A interface visual não deverá possuir acesso automático:

- ao banco completo;
- a todas as senhas;
- ao sistema de arquivos inteiro;
- à execução arbitrária de programas.

---

# 133. SEGREDOS NA INTERFACE

A interface não deverá receber todas as credenciais descriptografadas para decidir qual utilizar.

A operação privilegiada responsável pela comunicação deverá receber ou recuperar apenas a credencial necessária.

---

# 134. EXPORTAÇÃO DE CONFIGURAÇÃO

Se uma função de exportação for adicionada, o sistema deverá definir claramente se credenciais serão incluídas.

Por padrão, exportações de configuração não deverão conter senhas em texto puro.

Caso sejam incluídos segredos, o arquivo exportado deverá possuir proteção criptográfica adequada.

---

# 135. IMPORTAÇÃO

Dados importados deverão ser tratados como entrada não confiável.

A aplicação deverá validar:

- formatos;
- URLs;
- identificadores;
- tamanhos;
- conteúdo;
- credenciais.

---

# 136. INTEGRIDADE DO BANCO

O sistema deverá lidar com falhas ou corrupção do armazenamento local.

Quando possível:

- identificar erro;
- evitar perda adicional;
- informar o usuário;
- permitir recuperação ou restauração.

---

# 137. MIGRAÇÕES

Atualizações futuras do aplicativo poderão modificar dados locais.

Essas mudanças deverão preservar:

- câmeras cadastradas;
- configurações;
- credenciais criptografadas;
- histórico compatível.

---

# 138. FUSO HORÁRIO E DATAS

Gravações, snapshots, logs e eventos deverão possuir data e hora consistentes.

O sistema deverá diferenciar adequadamente horário local e formatos internos quando necessário.

---

# 139. SINCRONIZAÇÃO DE HORÁRIO

Diferenças entre horário do computador e horário da câmera poderão afetar:

- eventos;
- timestamps;
- gravações;
- diagnóstico.

Quando relevante, a aplicação poderá informar divergências detectadas.

---

# 140. EXPERIÊNCIA DURANTE ERROS

Erros técnicos não deverão inundar o usuário com notificações repetitivas.

Problemas persistentes deverão ser apresentados de maneira consolidada e visível no estado da câmera.

---

# 141. AÇÕES IRREVERSÍVEIS

Ações como:

- excluir câmera;
- apagar gravação;
- excluir snapshot;
- remover configurações;

deverão solicitar confirmação quando houver risco de perda permanente.

---

# 142. INDEPENDÊNCIA DE INTERNET

Para utilização de câmeras na rede local, a aplicação deverá continuar funcionando mesmo sem acesso à internet.

Conexão com internet não deverá ser requisito para:

- abrir o sistema;
- consultar câmeras locais;
- visualizar RTSP;
- usar ONVIF;
- controlar PTZ;
- gravar localmente.

---

# 143. FIREWALL

A documentação de instalação deverá indicar que determinadas funções, especialmente descoberta ONVIF, podem depender de permissões de firewall.

A aplicação não deverá modificar regras de firewall silenciosamente.

---

# 144. INTERFACES DE REDE

Computadores podem possuir múltiplas interfaces, como:

- Ethernet;
- Wi-Fi;
- VPN;
- interfaces virtuais.

A descoberta deverá considerar essa realidade.

Quando necessário, o usuário poderá selecionar ou restringir a interface utilizada para busca de câmeras.

---

# 145. VPN

O funcionamento através de VPN dependerá da capacidade da VPN de transportar ou rotear os protocolos necessários.

A aplicação não deverá prometer descoberta multicast através de VPN quando a rede não oferecer esse suporte.

Cadastro manual poderá continuar disponível.

---

# 146. SEGMENTAÇÃO DE REDE

Em ambientes com câmeras em VLAN separada, o programa deverá continuar permitindo acesso por IP quando existir roteamento e regras de firewall adequadas.

Descoberta automática poderá não estar disponível nesses casos.

---

# 147. MÚLTIPLAS SESSÕES

A aplicação deverá evitar abrir sessões desnecessárias contra uma câmera.

Determinados equipamentos possuem limites reduzidos de conexões simultâneas.

O sistema deverá reutilizar recursos quando possível.

---

# 148. LIMITES DAS CÂMERAS

Algumas câmeras podem limitar:

- número de clientes RTSP;
- sessões ONVIF;
- streams simultâneos;
- conexões HTTP.

O programa deverá tratar recusas de conexão sem assumir imediatamente que existe erro no software.

---

# 149. ESTADO DE GRAVAÇÃO

Uma câmera exibida no painel deverá possuir indicador claro quando estiver sendo gravada.

A interface deverá distinguir:

- não gravando;
- iniciando gravação;
- gravando;
- encerrando;
- erro de gravação.

---

# 150. RECUPERAÇÃO APÓS FALHA DO PROGRAMA

Quando tecnicamente possível, gravações devem utilizar estratégia que reduza o risco de perda total em caso de encerramento inesperado.

Arquivos parciais recuperáveis são preferíveis à perda integral de uma sessão longa.

---

# 151. CONTROLE DE QUALIDADE

Antes de uma versão ser considerada estável, deverá haver validação de:

- Windows;
- Linux;
- ONVIF;
- RTSP;
- H.264;
- H.265 quando aplicável;
- PTZ;
- snapshot;
- gravação;
- credenciais criptografadas;
- reconexão;
- múltiplas câmeras.

---

# 152. CRITÉRIOS DE ACEITAÇÃO DO MVP

O MVP será considerado funcional quando um usuário puder:

- instalar o programa;
- abrir sem ferramentas de desenvolvimento;
- localizar ou cadastrar uma câmera;
- autenticar-se;
- salvar a câmera;
- reiniciar o programa sem perder a configuração;
- manter a senha protegida no banco local;
- visualizar stream;
- utilizar PTZ quando disponível;
- capturar snapshot;
- gravar vídeo;
- usar mais de uma câmera;
- sobreviver a quedas temporárias de rede com reconexão.

---

# 153. REGRA PRINCIPAL DE SEGURANÇA

Nenhuma conveniência funcional poderá justificar armazenamento de senha em texto puro, exposição de credenciais em logs ou execução insegura de comandos.

Segurança deverá ser tratada como requisito obrigatório do sistema.

---

# 154. REGRA PRINCIPAL DE COMPATIBILIDADE

A aplicação deverá detectar capacidades em vez de presumir funcionalidades.

ONVIF não significa que todos os recursos ONVIF estejam presentes.

---

# 155. REGRA PRINCIPAL DE STREAMING

O sistema deverá tratar RTSP/RTP/RTCP através de tecnologia apropriada de mídia e não deverá depender de suporte inexistente ou inconsistente do navegador a RTSP direto.

---

# 156. REGRA PRINCIPAL DE DESEMPENHO

A aplicação deverá evitar transcoding quando o stream puder ser utilizado sem conversão.

Substreams deverão ser aproveitados para visualizações múltiplas sempre que possível.

---

# 157. REGRA PRINCIPAL DE ISOLAMENTO

A falha de uma câmera ou stream não deverá derrubar o restante da aplicação.

---

# 158. REGRA PRINCIPAL DE PRIVACIDADE

Dados das câmeras deverão permanecer locais por padrão.

Nenhuma imagem, gravação, stream ou credencial deverá ser enviada para serviços externos sem funcionalidade explicitamente autorizada pelo usuário.

---

# 159. REGRA PRINCIPAL DE EXTENSIBILIDADE

A implementação deverá permitir evolução para novos protocolos, fabricantes, recursos de vídeo e funcionalidades futuras sem exigir reconstrução completa do sistema.

Este requisito não determina uma estrutura interna específica de código.

---

# 160. RESULTADO FINAL ESPERADO

O produto deverá funcionar como uma aplicação desktop de monitoramento de câmeras IP/Wi-Fi capaz de:

Descobrir dispositivos

→ autenticar

→ identificar capacidades

→ obter streams

→ reproduzir vídeo

→ controlar PTZ

→ capturar imagens

→ realizar gravações

→ monitorar múltiplas câmeras

→ recuperar-se de falhas de conexão

→ manter configurações e credenciais de maneira local e segura.

A aplicação deverá executar essas funções tanto em Windows quanto em Linux, respeitando as limitações reais de cada câmera, protocolo, codec e sistema operacional.

O comportamento definido nesta documentação é obrigatório, mas este documento deliberadamente não impõe estrutura de diretórios, classes, módulos, tabelas específicas ou arquitetura interna de código. A equipe responsável pela implementação poderá definir esses detalhes desde que todas as regras funcionais, técnicas e de segurança descritas sejam integralmente respeitadas.